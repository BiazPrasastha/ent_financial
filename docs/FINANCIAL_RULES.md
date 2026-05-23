# Financial Rules

## Currency Representation

All monetary values in the system are represented as `Decimal(18,4)` in the PostgreSQL database. In application logic, we use `big.js` `Big` instances. At the API boundary, amounts are serialized and deserialized as plain strings.

- **Database**: `Decimal(18,4)` (e.g., `100.0000`)
- **Application**: `new Big("100.0000")`
- **API**: Plain string `"100.0000"`

This eliminates floating-point drift entirely.

## Fee Calculation

The fee rate is a constant `Big("0.03")` (3%).

**Formula:**
```
fee = round(amount * 0.03, 4, ROUND_HALF_UP)
```

**Edge cases:**

| Input amount | Expected fee | Calculation                 |
| :----------- | :----------- | :-------------------------- |
| `1.0000`     | `0.0300`     | `1.00 * 0.03 = 0.0300`      |
| `100.0000`   | `3.0000`     | `100.00 * 0.03 = 3.0000`    |
| `999999.9900`| `29999.9997` | `999999.99 * 0.03`          |
| `10 * 0.03`  | `0.3000`     | Summed across 10 orders      |

## Double-Entry Ledger

**Invariant:** For any given order, the sum of all debits must equal the sum of all credits. The delta must be exactly `0.0000`.

**Account Types:**

| Account           | Role                                                    |
| :---------------- | :------------------------------------------------------ |
| `order_balance`   | Tracks the value of the order being processed           |
| `order_pending`     | Tracks value awaiting payment processing                |
| `payment_received`  | Tracks value successfully received from the customer      |
| `fees_owed`         | Tracks fees calculated and deducted from the payment    |
| `seller_payout`     | Tracks the net amount to be transferred to the seller   |

**Example full lifecycle for a $100.00 order:**

| # | Event               | Account            | Debit     | Credit    | Balance   |
| :-: | :------------------ | :----------------- | :-------- | :-------- | :-------- |
| 1 | OrderCreated        | `order_balance`    | 100.0000  | —         | 100.0000  |
| 1 | OrderCreated        | `order_pending`    | —         | 100.0000  | 0.0000    |
| 2 | PaymentConfirmed    | `payment_received` | 100.0000  | —         | 100.0000  |
| 2 | PaymentConfirmed    | `order_balance`    | —         | 100.0000  | 0.0000    |
| 3 | FeeCalculated       | `fees_owed`        | 3.0000    | —         | 3.0000    |
| 3 | FeeCalculated       | `payment_received` | —         | 3.0000    | 0.0000    |
| 4 | SettlementProcessed | `seller_payout`    | 97.0000   | —         | 97.0000   |
| 4 | SettlementProcessed | `payment_received` | —         | 97.0000   | 0.0000    |

Total Debits = 300.0000. Total Credits = 300.0000. Delta = 0.0000.

## Immutability Guarantee

`EventLog` and `Ledger` tables are **append-only**. Rows are never updated or deleted. If a correction is needed (e.g., a refund), a new compensating entry is appended.

## Settlement Mechanics

**Net Payout Formula:**
```
netPayout = order.amount - sum(fees_owed DEBIT for orderId)
```

**Idempotency:** The `settlement-{date}-{orderId}` key prevents duplicate settlement. If the settlement job is retried, already-settled orders are skipped.

**What happens on double-settle?** The second attempt finds the existing `SettlementProcessed` event and skips the order, ensuring the `seller_payout` and `payment_received` entries are not duplicated.

## Compliance & Audit

**Event Replay:** The full state of any order can be reconstructed at any point in time by replaying its `EventLog` entries ordered by `(aggregateId, version)`.

**Verifying State at Any Time:** `verifyLedgerBalance(orderId)` uses a raw SQL `SUM(debit) - SUM(credit)` query to assert the ledger is balanced at that exact moment.
