import { v4 as uuidv4 } from "uuid";
import { toDecimal } from "../lib/decimal";
import { CardDeclinedError, StripeError } from "../lib/errors";

export interface ChargeResult {
  chargeId: string; // "ch_mock_<uuid>"
  status: "succeeded";
  amount: string; // formatted decimal string
  customerId: string;
}

export class StripeService {
  // In-memory idempotency store: idempotencyKey → ChargeResult
  private readonly charges = new Map<string, ChargeResult>();

  /**
   * Process a payment charge (mock).
   *
   * @param orderId       - used to build deterministic idempotency key if none provided
   * @param amount        - string ("100.0000") — validated: must be > 0, ≤ 999999.9999
   * @param customerId    - if ends with "_decline" → throw CardDeclinedError
   * @param idempotencyKey - UUID; same key → same ChargeResult returned
   *
   * @throws CardDeclinedError  when customerId ends with "_decline"
   * @throws StripeError        when amount > 999999.9999
   * @throws StripeError        when amount <= 0
   */
  async processPayment(
    orderId: string,
    amount: string,
    customerId: string,
    idempotencyKey: string
  ): Promise<ChargeResult> {
    // 1. Check idempotency store
    const cached = this.charges.get(idempotencyKey);
    if (cached) {
      return cached;
    }

    // 2. Validate amount using toDecimal (Big)
    const amountDecimal = toDecimal(amount);

    if (amountDecimal.lte("0")) {
      throw new StripeError(`Amount must be greater than 0, got: ${amount}`);
    }

    const maxAmount = toDecimal("999999.9999");
    if (amountDecimal.gt(maxAmount)) {
      throw new StripeError(`Amount exceeds maximum allowed value of 999999.9999, got: ${amount}`);
    }

    // 3. Check customerId for _decline
    if (customerId.endsWith("_decline")) {
      throw new CardDeclinedError(orderId);
    }

    // 4. Simulate 50ms latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 5. Generate chargeId = "ch_mock_" + uuidv4()
    const chargeId = `ch_mock_${uuidv4()}`;

    const result: ChargeResult = {
      chargeId,
      status: "succeeded",
      amount,
      customerId,
    };

    // 6. Store in charges map
    this.charges.set(idempotencyKey, result);

    // 7. Return ChargeResult
    return result;
  }

  /**
   * Retrieve a charge by idempotency key (for testing).
   */
  getCharge(idempotencyKey: string): ChargeResult | undefined {
    return this.charges.get(idempotencyKey);
  }

  /**
   * Reset store (for test teardown).
   */
  reset(): void {
    this.charges.clear();
  }
}
