export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  readonly statusCode = 409;

  constructor(
    public readonly orderId: string,
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(`Version conflict on order ${orderId}: expected ${expected}, got ${actual}`);
    this.name = VersionConflictError.name;
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  readonly statusCode = 409;

  constructor(public readonly key: string) {
    super(`Duplicate idempotencyKey: ${key}`);
    this.name = IdempotencyConflictError.name;
  }
}

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  readonly statusCode = 422;

  constructor(
    public readonly orderId: string,
    public readonly from: string,
    public readonly to: string
  ) {
    super(`Invalid status transition on order ${orderId}: ${from} → ${to}`);
    this.name = InvalidTransitionError.name;
  }
}

export class StripeError extends Error {
  readonly code = "STRIPE_ERROR";
  readonly statusCode = 502;

  constructor(public readonly detail: string) {
    super(`Stripe processing error: ${detail}`);
    this.name = StripeError.name;
  }
}

export class CardDeclinedError extends Error {
  readonly code = "CARD_DECLINED";
  readonly statusCode = 402;

  constructor(public readonly orderId: string) {
    super(`Card declined for order ${orderId}`);
    this.name = CardDeclinedError.name;
  }
}

export class LedgerImbalanceError extends Error {
  readonly code ="LEDGER_IMBALANCE";
  readonly statusCode = 500;

  constructor(
    public readonly orderId: string,
    public readonly delta: string
  ) {
    super(`Ledger imbalance on order ${orderId}: delta=${delta}`);
    this.name = LedgerImbalanceError.name;
  }
}

export class OrderNotFoundError extends Error {
  readonly code = "ORDER_NOT_FOUND";
  readonly statusCode = 404;

  constructor(public readonly orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = OrderNotFoundError.name;
  }
}
