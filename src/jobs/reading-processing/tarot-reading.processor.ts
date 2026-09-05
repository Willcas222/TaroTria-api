import { Injectable, Logger } from '@nestjs/common';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { PromptsService } from '../../ai/prompts.service';
import { TAROT_INTERPRETATION_TASK } from '../../ai/tasks/tarot-interpretation.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import type { ReadingProcessor } from './reading-processor.interface';

const SUIT_LABELS: Record<string, string> = {
  WANDS: 'Bastos',
  CUPS: 'Copas',
  SWORDS: 'Espadas',
  PENTACLES: 'Oros',
};

// Lógica de dominio pura: "procesar una lectura de tarot hasta un resultado
// final". No conoce BullMQ — el dispatcher (`ReadingProcessingConsumer`) es
// el único punto conectado a la cola, y lo invoca por nombre de job. Así, un
// job de otro tipo (ej. `PROCESS_PALM`) nunca llega aquí por error.
@Injectable()
export class TarotReadingProcessor implements ReadingProcessor {
  private readonly logger = new Logger(TarotReadingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptsService: PromptsService,
    private readonly aiOrchestrator: AiOrchestratorService,
    private readonly walletService: WalletService,
  ) {}

  async processReading(readingId: string): Promise<void> {
    const reading = await this.prisma.reading.findUnique({
      where: { id: readingId },
      include: {
        input: true,
        spread: { include: { positions: true } },
        draws: { include: { card: true } },
      },
    });

    if (!reading) {
      this.logger.warn(`Reading ${readingId} not found, skipping.`);
      return;
    }

    if (reading.status === 'COMPLETED') {
      this.logger.log(`Reading ${readingId} already completed, skipping.`);
      return;
    }

    await this.prisma.reading.update({
      where: { id: readingId },
      data: { status: 'PROCESSING' },
    });

    const promptVersionId = await this.promptsService.getPublishedVersionId(
      TAROT_INTERPRETATION_TASK,
    );

    const answers = (reading.input?.answers ?? {}) as Record<string, unknown>;
    const question =
      typeof answers.question === 'string' ? answers.question : '';
    const topic = typeof answers.topic === 'string' ? answers.topic : '';

    const positionOrder = new Map(
      reading.spread?.positions.map((p) => [p.code, p.orderIndex]) ?? [],
    );
    const orderedDraws = [...reading.draws].sort(
      (a, b) =>
        (positionOrder.get(a.position) ?? 0) -
        (positionOrder.get(b.position) ?? 0),
    );
    const cardsText = orderedDraws
      .map((draw) => {
        const orientation =
          draw.orientation === 'UPRIGHT' ? 'derecha' : 'invertida';
        const suit = draw.card.suit ? ` de ${SUIT_LABELS[draw.card.suit]}` : '';
        return `${draw.position}: ${draw.card.name}${suit} (${orientation})`;
      })
      .join('\n');

    const result = await this.aiOrchestrator.execute({
      promptVersionId,
      readingId,
      variables: { question, topic, cards: cardsText },
      riskCheckText: question,
    });

    if (result.status === 'COMPLETED') {
      await this.walletService.confirmConsumption(readingId);
    } else {
      await this.walletService.releaseReservation(readingId);
    }

    await this.prisma.reading.update({
      where: { id: readingId },
      data: {
        status: result.status,
        promptVersionId,
      },
    });
  }
}
