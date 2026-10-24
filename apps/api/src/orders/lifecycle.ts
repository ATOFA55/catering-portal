import { OrderStatus } from '../db/schema';

/** Allowed status transitions - Business Requirements v4.0, Section 13.1 (FR-79, BR-27). */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['AWAITING_CUSTOMER_APPROVAL', 'CONFIRMED', 'CANCELLED'],
  AWAITING_CUSTOMER_APPROVAL: ['CONFIRMED', 'CANCELLED', 'PENDING'], // PENDING: approved, but confirmation waits for stock
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_DISPATCH'],
  READY_FOR_DISPATCH: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERY_FAILED: ['READY_FOR_DISPATCH'],
  DELIVERED: [],
  CANCELLED: [],
};

export const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'CONFIRMED', 'PREPARING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Draft', PENDING: 'Pending', AWAITING_CUSTOMER_APPROVAL: 'Awaiting Customer Approval', CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing', READY_FOR_DISPATCH: 'Ready for Dispatch', OUT_FOR_DELIVERY: 'Out for Delivery', DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery Failed', CANCELLED: 'Cancelled',
};
