import type { Order } from '@prisma/client';

export interface OrderSummary {
  id: string;
  status: Order['status'];
  credits: number;
  priceCents: number;
  currency: string;
  createdAt: Date;
}

export function toOrderSummary(order: Order): OrderSummary {
  return {
    id: order.id,
    status: order.status,
    credits: order.credits,
    priceCents: order.priceCents,
    currency: order.currency,
    createdAt: order.createdAt,
  };
}

export interface AdminOrderSummary extends OrderSummary {
  userId: string;
}

export function toAdminOrderSummary(order: Order): AdminOrderSummary {
  return { ...toOrderSummary(order), userId: order.userId };
}

export interface PaginatedOrders {
  items: AdminOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
}
