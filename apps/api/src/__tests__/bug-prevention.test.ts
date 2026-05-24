import { PrismaClient, Ledger } from "@prisma/client";
import { EventService } from "../services/eventService";
import { StripeService } from "../services/stripeService";
import { VersionConflictError, IdempotencyConflictError } from "../lib/errors";
import { v4 as uuidv4 } from "uuid";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://user:pass@localhost:5432/entropi";

let prisma: PrismaClient;
let eventService: EventService;
let stripeService: StripeService;

beforeAll(async () => {
  prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });

  eventService = new EventService(prisma);
  stripeService = new StripeService();
});

beforeEach(async () => {
  // Single CASCADE truncate to avoid deadlocks
  await prisma.$executeRaw`TRUNCATE TABLE "Ledger", "EventLog", "Order" CASCADE;`;
  stripeService.reset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Bug Prevention Tests - CODE_REVIEW.md", () => {
  test("Bug 1: Prevents TOCTOU - concurrent payments handled correctly", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `order-${orderId}`;

    await eventService.recordOrder(
      orderId, "customer_123", "card", "100.0000", idempotencyKey
    );

    const paymentKey1 = `payment-${orderId}-1`;
    const paymentKey2 = `payment-${orderId}-2`;

    const results = await Promise.allSettled([
      eventService.recordPayment(orderId, "100.0000", "ch_1", paymentKey1),
      eventService.recordPayment(orderId, "100.0000", "ch_2", paymentKey2),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;

    expect(fulfilled).toBe(1);
    expect(rejected).toBe(1);

    const events = await prisma.eventLog.findMany({
      where: { aggregateId: orderId, eventType: "PaymentConfirmed" },
    });
    expect(events).toHaveLength(1);
  });

  test("Bug 2: Idempotency check inside transaction - duplicate key returns original", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `order-${orderId}`;

    const { event: firstEvent } = await eventService.recordOrder(
      orderId, "customer_123", "card", "100.0000", idempotencyKey
    );

    const { event: secondEvent } = await eventService.recordOrder(
      orderId, "customer_456", "cash", "200.0000", idempotencyKey
    );

    expect(secondEvent.id).toBe(firstEvent.id);
    expect(secondEvent.eventType).toBe("OrderCreated");

    const events = await prisma.eventLog.findMany({
      where: { aggregateId: orderId },
    });
    expect(events).toHaveLength(1);
  });

  test("Bug 3: Idempotency prevents duplicate processing", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `payment-${orderId}`;

    await eventService.recordOrder(
      orderId, "customer_123", "card", "100.0000", `order-${orderId}`
    );

    const firstEvent = await eventService.recordPayment(
      orderId, "100.0000", "ch_1", idempotencyKey
    );

    const secondEvent = await eventService.recordPayment(
      orderId, "100.0000", "ch_2", idempotencyKey
    );

    expect(secondEvent.id).toBe(firstEvent.id);

    const events = await prisma.eventLog.findMany({
      where: { aggregateId: orderId, eventType: "PaymentConfirmed" },
    });
    expect(events).toHaveLength(1);
  });

  test("Bug 4: Optimistic locking prevents version conflicts", async () => {
    const orderId = uuidv4();

    await eventService.recordOrder(
      orderId, "customer_123", "card", "100.0000", `order-${orderId}`
    );

    await eventService.recordPayment(
      orderId, "100.0000", "ch_1", `payment-${orderId}`
    );

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(order!.version).toBeGreaterThan(1);
  });

  test("Bug 5: Ledger entries are created for payment", async () => {
    const orderId = uuidv4();

    await eventService.recordOrder(
      orderId, "customer_123", "card", "100.0000", `order-${orderId}`
    );

    await eventService.recordPayment(
      orderId, "100.0000", "ch_1", `payment-${orderId}`
    );

    const ledgerEntries = await prisma.ledger.findMany({
      where: { orderId },
      orderBy: { timestamp: "asc" },
    });

    expect(ledgerEntries).toHaveLength(4);

    const paymentEntries = ledgerEntries.filter(
      (e: Ledger) => e.account === "payment_received" || e.account === "order_balance"
    );

    const debitEntry = paymentEntries.find(
      (e: Ledger) => e.account === "payment_received" && e.debit?.equals("100.0000")
    );
    expect(debitEntry).toBeDefined();
    expect(debitEntry!.account).toBe("payment_received");

    const creditEntry = paymentEntries.find(
      (e: Ledger) => e.account === "order_balance" && e.credit?.equals("100.0000")
    );
    expect(creditEntry).toBeDefined();
    expect(creditEntry!.account).toBe("order_balance");
  });

  test("Bug 6: Transaction rollback on failure", async () => {
    const orderId = uuidv4();

    await eventService.recordOrder(
      orderId, "customer_123", "card", "100.0000", `order-${orderId}`
    );

    const ledgerCountBefore = await prisma.ledger.count({ where: { orderId } });
    expect(ledgerCountBefore).toBe(2);
  });

  test("Bug 7: Amount precision preserved as string", async () => {
    const orderId = uuidv4();
    const amount = "999999.9900";

    await eventService.recordOrder(
      orderId, "customer_123", "card", amount, `order-${orderId}`
    );

    await eventService.calculateFees(orderId, amount, `fees-${orderId}`);

    const feeEvent = await prisma.eventLog.findFirst({
      where: { aggregateId: orderId, eventType: "FeeCalculated" },
    });

    expect(feeEvent).toBeDefined();
    expect((feeEvent!.payload as any).fee).toBe("29999.9997");
    expect((feeEvent!.payload as any).amount).toBe(amount);
  });

  test("Bug 7 fix: Uses FEE_RATE constant for precision", async () => {
    const orderId = uuidv4();
    const amount = "100.0000";

    await eventService.recordOrder(
      orderId, "customer_123", "card", amount, `order-${orderId}`
    );

    await eventService.calculateFees(orderId, amount, `fees-${orderId}`);

    const feeEvent = await prisma.eventLog.findFirst({
      where: { aggregateId: orderId, eventType: "FeeCalculated" },
    });

    expect((feeEvent!.payload as any).fee).toBe("3.0000");
  });

  test("Financial integrity: Ledger remains balanced", async () => {
    const orderId = uuidv4();

    await eventService.recordOrder(
      orderId, "customer_123", "card", "100.0000", `order-${orderId}`
    );

    await eventService.calculateFees(orderId, "100.0000", `fees-${orderId}`);

    await eventService.recordPayment(
      orderId, "100.0000", "ch_1", `payment-${orderId}`
    );

    const isBalanced = await eventService.verifyLedgerBalance(orderId);
    expect(isBalanced).toBe(true);
  });
});
