# Concurrency Strategy

## The Problem

Financial systems must guarantee correctness under concurrent access. Two users attempting to modify the same order, or a network retry causing a duplicate charge, can lead to data corruption or double-charging if not handled correctly.

## Strategy 1: Optimistic Locking

Every `Order` row carries an integer `version` field. Before any mutation, the application reads the current version, then issues an `UPDATE ... WHERE version = currentVersion`. If the row was modified in the interim, the `WHERE` clause matches zero rows, and Prisma throws a `P2025` error. We catch this and re-throw a `VersionConflictError`.

```sql
UPDATE "Order"
SET version = version + 1, status = 'PAID'
WHERE id = 'order-123' AND version = 2;
```

If this returns `0 rows matched`, another transaction won the race.

## Strategy 2: Idempotency Keys

Clients generate a UUID `idempotencyKey` and send it in a header (e.g., `idempotency-key`). Before writing any state, the server checks for an existing `EventLog` row with that key. If found, the original result is returned immediately. The database `UNIQUE` constraint on `idempotencyKey` guarantees that even if two identical requests arrive simultaneously, only one will succeed.

```sql
INSERT INTO "EventLog" (idempotencyKey, ...)
VALUES ('uuid-v4', ...);
-- Duplicate key exception on second insert
```

## Strategy 3: Transaction Scoping

We use Prisma's interactive transactions (`prisma.$transaction(async (tx) => { ... })`), not the array form, because we need conditional logic (idempotency check, optimistic lock) inside the transaction boundary.

**Critical rule**: Each order mutation is in its own transaction. We do **not** wrap a full batch settlement in a single transaction. This limits lock scope and prevents one failed order from rolling back all others.

## Strategy 4: Settlement Idempotency

Settlement uses a deterministic idempotency key per order per day:

```
settlement-{date}-{orderId}
```

If the `dailySettlement` job is restarted, each order's settlement step is skipped if the key already exists. This makes the batch job safe to retry at any time.

## Test Evidence

The `concurrency.test.ts` suite contains a test that fires **100 concurrent `recordOrder` calls** via `Promise.all`. After all promises resolve, it asserts:

- Exactly 100 `Order` rows exist.
- Exactly 100 `EventLog` rows with `eventType = OrderCreated` exist.
- Exactly 200 `Ledger` rows exist (2 per order).
- For every single order, `verifyLedgerBalance` returns `true`.

This proves that under high concurrency, there is no double-writing, no lost updates, and the double-entry ledger remains perfectly balanced.
