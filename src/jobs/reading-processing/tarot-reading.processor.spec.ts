import { Test } from '@nestjs/testing';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { PromptsService } from '../../ai/prompts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import { TarotReadingProcessor } from './tarot-reading.processor';

const baseReading = {
  id: 'reading-1',
  status: 'PENDING' as const,
  service: { code: 'TAROT_THREE' },
  input: { answers: { question: '¿Qué me depara?' } },
  spread: {
    positions: [
      { code: 'PAST', orderIndex: 0 },
      { code: 'PRESENT', orderIndex: 1 },
      { code: 'TREND', orderIndex: 2 },
    ],
  },
  draws: [
    {
      position: 'TREND',
      orientation: 'UPRIGHT' as const,
      card: { name: 'El Mundo', suit: null },
    },
    {
      position: 'PAST',
      orientation: 'REVERSED' as const,
      card: { name: 'Reina de Bastos', suit: 'WANDS' },
    },
    {
      position: 'PRESENT',
      orientation: 'UPRIGHT' as const,
      card: { name: 'El Mago', suit: null },
    },
  ],
};

describe('TarotReadingProcessor', () => {
  let processor: TarotReadingProcessor;
  let prisma: {
    reading: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let promptsService: { getPublishedVersionId: jest.Mock };
  let aiOrchestrator: { execute: jest.Mock };
  let walletService: {
    confirmConsumption: jest.Mock;
    releaseReservation: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      reading: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    promptsService = {
      getPublishedVersionId: jest.fn().mockResolvedValue('version-1'),
    };
    aiOrchestrator = { execute: jest.fn() };
    walletService = {
      confirmConsumption: jest.fn().mockResolvedValue(undefined),
      releaseReservation: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        TarotReadingProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: PromptsService, useValue: promptsService },
        { provide: AiOrchestratorService, useValue: aiOrchestrator },
        { provide: WalletService, useValue: walletService },
      ],
    }).compile();

    processor = module.get(TarotReadingProcessor);
  });

  describe('processReading', () => {
    it('does nothing when the reading no longer exists', async () => {
      prisma.reading.findUnique.mockResolvedValue(null);

      await processor.processReading('missing');

      expect(promptsService.getPublishedVersionId).not.toHaveBeenCalled();
      expect(prisma.reading.update).not.toHaveBeenCalled();
    });

    it('is idempotent: never reprocesses a reading that is already COMPLETED', async () => {
      prisma.reading.findUnique.mockResolvedValue({
        ...baseReading,
        status: 'COMPLETED',
      });

      await processor.processReading('reading-1');

      expect(aiOrchestrator.execute).not.toHaveBeenCalled();
      expect(prisma.reading.update).not.toHaveBeenCalled();
    });

    it('marks the reading PROCESSING, builds the prompt variables in position order, and completes on success', async () => {
      prisma.reading.findUnique.mockResolvedValue(baseReading);
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'COMPLETED',
        output: { title: 'x' },
      });

      await processor.processReading('reading-1');

      expect(promptsService.getPublishedVersionId).toHaveBeenCalledWith(
        'TAROT_THREE_INTERPRETATION',
      );

      expect(prisma.reading.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'reading-1' },
        data: { status: 'PROCESSING' },
      });

      expect(aiOrchestrator.execute).toHaveBeenCalledWith({
        promptVersionId: 'version-1',
        readingId: 'reading-1',
        variables: {
          question: '¿Qué me depara?',
          cards:
            'PAST: Reina de Bastos de Bastos (invertida)\nPRESENT: El Mago (derecha)\nTREND: El Mundo (derecha)',
        },
        riskCheckText: '¿Qué me depara?',
      });

      expect(prisma.reading.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'reading-1' },
        data: { status: 'COMPLETED', promptVersionId: 'version-1' },
      });
      expect(walletService.confirmConsumption).toHaveBeenCalledWith(
        'reading-1',
      );
      expect(walletService.releaseReservation).not.toHaveBeenCalled();
    });

    it('resolves the prompt code from the reading service, so a different spread depth uses its own prompt', async () => {
      prisma.reading.findUnique.mockResolvedValue({
        ...baseReading,
        service: { code: 'TAROT_FIVE' },
      });
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'COMPLETED',
        output: { title: 'x' },
      });

      await processor.processReading('reading-1');

      expect(promptsService.getPublishedVersionId).toHaveBeenCalledWith(
        'TAROT_FIVE_INTERPRETATION',
      );
    });

    it('marks the reading FAILED and releases the credit reservation when the orchestrator reports a terminal failure', async () => {
      prisma.reading.findUnique.mockResolvedValue(baseReading);
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'FAILED',
        errorMessage: 'blocked_by_output_guardrail',
      });

      await processor.processReading('reading-1');

      expect(prisma.reading.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'reading-1' },
        data: { status: 'FAILED', promptVersionId: 'version-1' },
      });
      expect(walletService.releaseReservation).toHaveBeenCalledWith(
        'reading-1',
      );
      expect(walletService.confirmConsumption).not.toHaveBeenCalled();
    });
  });
});
