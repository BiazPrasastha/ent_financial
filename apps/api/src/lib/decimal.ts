import Big from 'big.js';

// Set global rounding mode to ROUND_HALF_UP as a safety net
Big.RM = 1;

export { Big };

export const ZERO = new Big("0");
export const FEE_RATE = new Big("0.03");

/**
 * Convert any amount representation to Big.
 * Accepts: string | number | Big | Prisma Decimal (which has .toString())
 */
export function toDecimal(value: { toString(): string } | string | number): Big {
  return new Big(value.toString());
}

/**
 * Add two amounts. Returns Big.
 */
export function addDecimal(a: Big, b: Big): Big {
  return a.plus(b);
}

/**
 * Subtract b from a. Returns Big.
 */
export function subDecimal(a: Big, b: Big): Big {
  return a.minus(b);
}

/**
 * Multiply. Used for fee calculation: mulDecimal(amount, FEE_RATE).
 * Result rounded to 4dp ROUND_HALF_UP.
 */
export function mulDecimal(a: Big, b: Big): Big {
  return a.times(b).round(4, 1);
}

/**
 * Format to exactly 4 decimal places as string — for DB writes and API responses.
 * Rounding is explicit here, not reliant on the global Big.DP setting.
 */
export function formatDecimal(value: Big): string {
  return value.round(4, 1).toFixed(4);
}

/**
 * Assert two Big values are equal (used in tests and ledger verification).
 */
export function decimalEqual(a: Big, b: Big): boolean {
  return a.eq(b);
}
