import { OrderStatus } from "@prisma/client";
import { InvalidTransitionError } from "./errors";

export type StatusTransitionMap = Record<OrderStatus, OrderStatus[]>;

export const VALID_TRANSITIONS: StatusTransitionMap = {
  PENDING: ["PROCESSING", "PAID", "REFUNDED"],
  PROCESSING: ["PAID", "REFUNDED"],
  PAID: ["SHIPPED", "REFUNDED", "SETTLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["SETTLED", "REFUNDED"],
  SETTLED: [],
  REFUNDED: [],
};

/**
 * Assert that transitioning from `from` to `to` is legal.
 * Throws InvalidTransitionError if not.
 * Returns void if valid.
 */
export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  orderId: string
): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(orderId, from, to);
  }
}

/**
 * Returns all reachable next statuses from `current`.
 */
export function nextStatuses(current: OrderStatus): OrderStatus[] {
  return [...VALID_TRANSITIONS[current]];
}
