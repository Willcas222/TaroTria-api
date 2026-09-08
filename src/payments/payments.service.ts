import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Payment, type PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import {
  PAYMENT_PROVIDER,
  type CheckoutIntent,
  type PaymentProvider,
  type TransactionResult,
  type TransactionStatus,
} from './payment-provider.interface';
import { toAdminPaymentSummary, type PaginatedPayments } from './payment.types';

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

// Wompi distingue más estados (ERROR, VOIDED) de los que modela nuestro
// PaymentStatus (sección 8 del plan). ERROR es un fallo técnico del
// proveedor -> FAILED; VOIDED es una transacción anulada que nunca llegó a
// completarse -> DECLINED, la semántica más cercana disponible.
const TERMINAL_STATUS_MAP: Record<TransactionStatus, PaymentStatus | null> = {
  PENDING: null,
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  ERROR: 'FAILED',
  VOIDED: 'DECLINED',
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async createCheckoutIntent(
    userId: string,
    orderId: string,
  ): Promise<CheckoutIntent> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Esta orden ya no está pendiente de pago.');
    }

    // Única por intento de pago, no por orden: un reintento tras un pago
    // declinado genera una referencia nueva y por lo tanto un Payment nuevo,
    // sin chocar con el unique(provider, providerReference) del anterior.
    const reference = `order-${order.id}-${randomUUID()}`;
    const appUrl = this.configService.get<string>('app.url');

    const intent = this.provider.buildCheckoutIntent({
      reference,
      amountInCents: order.priceCents,
      currency: order.currency,
      redirectUrl: `${appUrl}/wallet/checkout/${order.id}`,
    });

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: this.provider.name,
        providerReference: reference,
        status: 'PENDING',
        amountCents: order.priceCents,
        currency: order.currency,
      },
    });

    return intent;
  }

  // Red de seguridad para cuando el webhook de Wompi no llega (frecuente en
  // local, donde la URL pública depende de un túnel efímero; también puede
  // pasar en producción por una entrega perdida). Wompi siempre agrega el id
  // de la transacción como query param al volver al redirect-url
  // (`?id=...`), así que el propio navegador del usuario puede pedirle a
  // nuestra API que verifique el estado real contra Wompi en vez de esperar
  // pasivamente. Reutiliza approvePayment/markPaymentTerminal, que ya son
  // idempotentes (updateMany where status=PENDING), así que no hay riesgo de
  // acreditar dos veces si el webhook también llega.
  async confirmFromReturn(
    userId: string,
    orderId: string,
    providerTransactionId: string,
  ): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, provider: this.provider.name, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      return; // Ya se resolvió por otra vía (webhook u otra confirmación).
    }

    const transaction = await this.provider.fetchTransaction(providerTransactionId);
    if (!transaction || transaction.reference !== payment.providerReference) {
      this.logger.warn(
        `No se pudo reconciliar el pago ${payment.id} con la transacción ${providerTransactionId} de Wompi.`,
      );
      return;
    }

    if (
      payment.amountCents !== transaction.amountInCents ||
      payment.currency !== transaction.currency
    ) {
      this.logger.error(
        `Amount/currency mismatch reconciling payment ${payment.id}: expected ${payment.amountCents} ${payment.currency}, got ${transaction.amountInCents} ${transaction.currency}. Refusing to process.`,
      );
      return;
    }

    const mappedStatus = TERMINAL_STATUS_MAP[transaction.status];
    if (mappedStatus === null) {
      return; // Sigue PENDING en Wompi; nada que hacer todavía.
    }

    if (mappedStatus === 'APPROVED') {
      await this.approvePayment(payment, transaction, mappedStatus);
    } else {
      await this.markPaymentTerminal(payment, transaction, mappedStatus);
    }
  }

  // Paso 6-8 de la sección 15 del plan: valida firma, referencia, moneda,
  // monto y estado, y en una transacción marca pago/orden y acredita
  // créditos una sola vez, incluso si Wompi reintenta la entrega.
  async handleWebhook(rawBody: unknown): Promise<void> {
    const parsed = this.provider.verifyAndParseWebhook(rawBody);
    if (!parsed) {
      throw new UnauthorizedException('Firma de webhook inválida.');
    }

    const { eventId, transaction } = parsed;

    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: this.provider.name,
          eventId,
          eventType: transaction.status,
          payload: rawBody as never,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        this.logger.log(
          `Ignoring duplicate Wompi webhook delivery (eventId=${eventId}).`,
        );
        return;
      }
      throw error;
    }

    const payment = await this.prisma.payment.findUnique({
      where: {
        provider_providerReference: {
          provider: this.provider.name,
          providerReference: transaction.reference,
        },
      },
    });
    if (!payment) {
      this.logger.warn(
        `Webhook references an unknown payment reference: ${transaction.reference}`,
      );
      return;
    }

    if (
      payment.amountCents !== transaction.amountInCents ||
      payment.currency !== transaction.currency
    ) {
      this.logger.error(
        `Amount/currency mismatch for payment ${payment.id}: expected ${payment.amountCents} ${payment.currency}, got ${transaction.amountInCents} ${transaction.currency}. Refusing to process.`,
      );
      return;
    }

    const mappedStatus = TERMINAL_STATUS_MAP[transaction.status];
    if (mappedStatus === null) {
      return; // PENDING: nada que hacer todavía.
    }

    if (mappedStatus === 'APPROVED') {
      await this.approvePayment(payment, transaction, mappedStatus);
    } else {
      await this.markPaymentTerminal(payment, transaction, mappedStatus);
    }
  }

  private async approvePayment(
    payment: Payment,
    transaction: TransactionResult,
    status: PaymentStatus,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status,
          providerTransactionId: transaction.providerTransactionId,
        },
      });
      if (updated.count === 0) {
        return; // Ya aprobado por una entrega anterior del webhook.
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID' },
      });

      await this.walletService.creditPurchase(
        tx,
        order.userId,
        order.id,
        order.credits,
      );
    });
  }

  private async markPaymentTerminal(
    payment: Payment,
    transaction: TransactionResult,
    status: PaymentStatus,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status,
          providerTransactionId: transaction.providerTransactionId,
        },
      });
      if (updated.count === 0) {
        return;
      }

      await tx.order.updateMany({
        where: { id: payment.orderId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });
  }

  async listAll(page: number, pageSize: number): Promise<PaginatedPayments> {
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count(),
    ]);

    return {
      items: items.map(toAdminPaymentSummary),
      total,
      page,
      pageSize,
    };
  }
}
