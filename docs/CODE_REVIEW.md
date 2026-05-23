# Code Review: Buggy `recordPayment` Implementation

> **Context**: This review analyses a `recordPayment` implementation provided as part of the Entropi assessment (Part D). The goal is to identify concurrency, financial, and correctness issues against the patterns established in the Entropi codebase.

---

## Bug 1: TOCTOU Race Condition

**Severity:** Critical  
**Location:** `const order = await db.order.findUnique(...)` and `if (order.payment_received > 0)`  
**Category:** Race Condition

**Description:**  
The code reads the `order` row and checks `payment_received > 0` outside of any transaction, then proceeds. Between the read and the subsequent write, another request could have processed payment for the same order. This is a classic Time-of-Check-Time-of-Use (TOCTOU) bug: the guard condition is stale by the time the write executes.

**Impact:**  
Two concurrent calls can both see `payment_received = 0`, both proceed, and both charge the customer. This results in a **double-charge** and an inconsistent order state.

**Fix:**  
Move the check (and the entire write sequence) inside a database transaction. In `eventService.ts`, we use `prisma.$transaction(async (tx) => { ... })` and read the order row inside the transaction, so we always see the latest committed state.

```typescript
return this.prisma.$transaction(async (tx) => {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
  });

  // Check is now inside the transaction — always sees the latest version
  assertTransition(order.status, 'PAID', orderId);
  ...
});
```

---

## Bug 2: Idempotency Check Outside Transaction

**Severity:** Critical  
**Location:** `const existing = await db.financialEvent.findUnique({ where: { idempotencyKey } });`  
**Category:** Idempotency Bug

**Description:**  
The idempotency check reads `financialEvent` outside a transaction. If two requests with the same `idempotencyKey` arrive simultaneously, both will read `null` (no existing row yet), both will proceed past the guard, and both will attempt to `create`. One will win the race; the other will hit a `P2002` unique constraint violation. The client receives a `500` error instead of a graceful, idempotent `200` with the original data.

**Impact:**  
Intermittent `500` errors on retries. API consumers cannot safely retry because a retry may crash instead of returning the original result. This erodes trust in idempotency guarantees.

**Fix:**  
Move the idempotency check to be the **first** operation inside the interactive transaction. In `eventService.ts`:

```typescript
return this.prisma.$transaction(async (tx) => {
  const existing = await tx.eventLog.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    return existing; // Graceful idempotent return
  }
  ...
});
```

---

## Bug 3: Stripe Charged Before Idempotency / Transaction Check

**Severity:** High  
**Location:** `const payment = await stripeAPI.charge(amount);`  
**Category:** Idempotency Bug / Error Handling

**Description:**  
The `stripeAPI.charge(amount)` call happens **before** the idempotency check and before entering a database transaction. If a network retry happens (e.g., the client timed out and retried), the second request will charge the card again because it has not yet checked whether the first request succeeded in recording the event.

**Impact:**  
**Double-charging the customer.** The financial ledger does not reflect the extra charge, and the customer is out of pocket. This is a critical financial bug.

**Fix:**  
In Entropi, the payment gateway call is separated from the DB transaction:

1. **Outside** the transaction: Call `StripeService.processPayment()` first. Stripe's own idempotency key prevents duplicate charges.
2. Pass the resulting `chargeId` into the DB transaction.
3. **Inside** the transaction: Check database idempotency first; if the event already exists, return it immediately without touching Stripe.

```typescript
// Route handler (outside transaction)
const stripeResult = await stripeService.processPayment(
  orderId, amount, customerId, idempotencyKey
);

// Then inside recordPayment (inside transaction)
return this.prisma.$transaction(async (tx) => {
  const existing = await tx.eventLog.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return existing;

  // Create event using the chargeId from Stripe
  await tx.eventLog.create({
    data: {
      payload: { amount, chargeId: stripeResult.chargeId },
      ...
    }
  });
});
```

---

## Bug 4: No Optimistic Version Locking

**Severity:** Critical  
**Location:** `version: order.version + 1`  
**Category:** Race Condition

**Description:**  
The version used (`order.version + 1`) is computed from a stale read of `order.version`. If two requests read `version = 1` concurrently, both compute `version = 2` and both attempt to create an event with that version. This either violates the `@@unique([aggregateId, version])` constraint (one call throws `P2002`) or, if the unique check is missing, corrupts the event stream with two events at the same version.

**Impact:**  
- **Constraint violation** → `500` error on the losing request.
- **Corrupt history** → Event stream replay is broken because versions are duplicated or skipped.

**Fix:**  
Use optimistic locking: update the `Order` row with a `WHERE version = expected` clause. In `eventService.ts`:

```typescript
const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

// Optimistic lock: only succeeds if version hasn't changed since read
try {
  await tx.order.update({
    where: { id: orderId, version: order.version },
    data: { version: { increment: 1 } },
  });
} catch (err: any) {
  if (err.code === 'P2025') {
    throw new VersionConflictError(orderId, order.version, order.version + 1);
  }
  throw err;
}
```

---

## Bug 5: Missing Ledger Entries

**Severity:** Critical  
**Location:** Entire function — no `db.ledger.create()` calls  
**Category:** Ledger Omission

**Description:**  
The function records a `financialEvent` and updates the `order.payment_received` field, but it never writes any rows to the `Ledger` table. Per the Entropi financial rules, `recordPayment` must append exactly two ledger entries: a `DEBIT` to `payment_received` and a `CREDIT` to `order_balance`.

**Impact:**  
- `verifyLedgerBalance` will report an **imbalance** for this order.
- The financial record is **incomplete**. Auditors cannot reconcile what happened to the money.
- The `getOrderLedger` endpoint will return an empty list, hiding the fact that a payment ever occurred.

**Fix:**  
In `eventService.ts`, inside the same transaction:

```typescript
await tx.ledger.create({
  data: {
    orderId,
    account: 'payment_received',
    debit: amount,
    credit: null,
    description: 'Payment received',
  },
});

await tx.ledger.create({
  data: {
    orderId,
    account: 'order_balance',
    debit: null,
    credit: amount,
    description: 'Order balance cleared',
  },
});
```

---

## Bug 6: No Database Transaction

**Severity:** Critical  
**Location:** Entire function — `financialEvent.create` and `order.update` are outside a transaction  
**Category:** Race Condition / Error Handling

**Description:**  
The code creates the `financialEvent`, then updates `order.payment_received`. These are two separate, non-atomic database calls. If the process crashes after the `financialEvent.create` but before the `order.update`, the system is left in an inconsistent state: the event is recorded, but the order still shows `payment_received = 0`.

**Impact:**  
- **Phantom event**: The event log says payment happened, but the order status disagrees.
- **Unretryable state**: A retry will see `payment_received = 0` and attempt to charge again, potentially double-charging the customer.

**Fix:**  
Wrap all writes in an interactive transaction. If **any** step fails, the entire operation rolls back:

```typescript
return this.prisma.$transaction(async (tx) => {
  // 1. Check idempotency
  // 2. Check version / lock
  // 3. Create event
  // 4. Create ledger entries
  // 5. Update order status
  // All succeeds, or none of it does
});
```

---

## Bug 7: Amount Stored as JavaScript Number (Potential Precision Loss)

**Severity:** High  
**Location:** `payload: { amount, chargeId: payment.id }`  
**Category:** Precision Error

**Description:**  
The `amount` variable is passed directly into the JSON payload. If `amount` is a JavaScript `Number` (e.g., `100.0000`), storing it in a JSON column is safe for small values, but JS `Number` (IEEE-754 double) only has 53 bits of precision. For very large values (e.g., `99999999999999.99`), some precision is lost when serialised to JSON. Even if the API receives `amount` as a string, the code does not enforce this, leaving it vulnerable to float drift if the caller accidentally passes a number.

**Impact:**  
- **Silent precision loss** for large monetary amounts.
- **Inconsistent state** between the string value stored in `Order.amount` (Decimal) and the potentially rounded value in `EventLog.payload` (JSON).
- Financial audit discrepancies.

**Fix:**  
In Entropi, the API boundary enforces `amount` as a string via JSON schema (`type: 'string', pattern: '^[0-9]+\.[0-9]{1,4}$'`). The string is then used directly in both `Big(amount)` calculations and `payload: { amount }`:

```typescript
// Amount is a string at the API boundary
const amount: string = request.body.amount;

// ... inside transaction ...
await tx.eventLog.create({
  data: {
    payload: { amount, chargeId: payment.id }, // amount is a string
    ...
  }
});
```

---

## Summary Table

| # | Bug Name | Severity | Category | Root Cause |
| :-: | :--- | :--- | :--- | :--- |
| 1 | TOCTOU Race Condition | Critical | Race Condition | Read + check outside transaction |
| 2 | Idempotency Check Outside Transaction | Critical | Idempotency Bug | `findUnique` outside `prisma.$transaction` |
| 3 | Stripe Charged Before Checks | High | Idempotency / Error Handling | `stripeAPI.charge` before idempotency lock |
| 4 | No Optimistic Version Locking | Critical | Race Condition | Stale version read; no `WHERE version = expected` |
| 5 | Missing Ledger Entries | Critical | Ledger Omission | No `ledger.create` calls inside the function |
| 6 | No Database Transaction | Critical | Race / Error Handling | Multiple unwrapped DB calls |
| 7 | Payload Amount as Number | High | Precision Error | `amount` not guaranteed to be a string |
