import { PrismaClient } from "@prisma/client";
import { EventService } from "../services/eventService";
import { StripeService } from "../services/stripeService";
import { formatDecimal, mulDecimal, toDecimal, FEE_RATE } from "../lib/decimal";
import { LedgerImbalanceError } from "../lib/errors";
import { v4 as uuidv4 } from "uuid";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://user:pass@localhost:5432/entropi";

let prisma: PrismaClient;
let eventService: EventService;
let stripeService: StripeService;

beforeAll(async () => {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: TEST_DATABASE_URL,
      },
    },
  });

  eventService = new EventService(prisma);
  stripeService = new StripeService();
});

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE TABLE "Ledger", "EventLog", "Order" CASCADE;`;
  stripeService.reset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("EventService", () => {
  test("happy path: recordOrder creates order, event, and balanced ledger", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `order-${orderId}`;

    const { order, event } = await eventService.recordOrder(
      orderId,
      "customer_123",
      "card",
      "250.0000",
      idempotencyKey
    );

    // Assert: Order exists in DB with status PENDING
    expect(order.status).toBe("PENDING");
    const dbOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(dbOrder).toBeTruthy();
    expect(dbOrder!.status).toBe("PENDING");

    // Assert: EventLog has 1 row with eventType OrderCreated
    const eventLog = await prisma.eventLog.findFirst({
      where: { aggregateId: orderId },
    });
    expect(eventLog).toBeTruthy();
    expect(eventLog!.eventType).toBe("OrderCreated");

    // Assert: Ledger has 2 rows (1 debit order_balance, 1 credit order_pending)
    const ledgerEntries = await prisma.ledger.findMany({
      where: { orderId },
    });
    expect(ledgerEntries).toHaveLength(2);
    expect(formatDecimal(toDecimal(ledgerEntries[0].debit!))).toBe("250.0000");
    expect(ledgerEntries[0].account).toBe("order_balance");
    expect(formatDecimal(toDecimal(ledgerEntries[1].credit!))).toBe("250.0000");
    expect(ledgerEntries[1].account).toBe("order_pending");

    // Assert: verifyLedgerBalance returns true
    const isBalanced = await eventService.verifyLedgerBalance(orderId);
    expect(isBalanced).toBe(true);
  });

  test("idempotency: duplicate recordOrder with same idempotencyKey returns original", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `order-${orderId}`;

    const { order: firstOrder, event: firstEvent } = await eventService.recordOrder(
      orderId,
      "customer_123",
      "card",
      "250.0000",
      idempotencyKey
    );

    const { order: secondOrder, event: secondEvent } = await eventService.recordOrder(
      orderId,
      "customer_456",
      "cash",
      "500.0000",
      idempotencyKey
    );

    // Assert: second call returns same event id
    expect(secondEvent.id).toBe(firstEvent.id);

    // Assert: only 1 EventLog row exists (no duplicate)
    const events = await prisma.eventLog.findMany({
      where: { aggregateId: orderId },
    });
    expect(events).toHaveLength(1);

    // Assert: only 2 Ledger rows exist (no duplicate)
    const ledger = await prisma.ledger.findMany({
      where: { orderId },
    });
    expect(ledger).toHaveLength(2);
  });

  test("recordPayment updates ledger and transitions order to PAID", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `order-${orderId}`;

    // Create order first
    await eventService.recordOrder(
      orderId,
      "customer_123",
      "card",
      "250.0000",
      idempotencyKey
    );

    // Transition to PROCESSING before payment
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PROCESSING" },
    });

    // Record payment
    await eventService.recordPayment(
      orderId,
      "250.0000",
      "ch_mock_123",
      `${idempotencyKey}-payment`
    );

    // Assert: Order.status === PAID
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(order!.status).toBe("PAID");

    // Assert: Ledger has 4 rows total (2 from recordOrder + 2 from recordPayment)
    const ledgerEntries = await prisma.ledger.findMany({
      where: { orderId },
    });
    expect(ledgerEntries).toHaveLength(4);

    // Assert: verifyLedgerBalance returns true after payment
    const isBalanced = await eventService.verifyLedgerBalance(orderId);
    expect(isBalanced).toBe(true);
  });

  test("version conflict: concurrent recordPayment calls result in one success one VersionConflictError", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `order-${orderId}`;

    // Create order first
    await eventService.recordOrder(
      orderId,
      "customer_123",
      "card",
      "250.0000",
      idempotencyKey
    );

    // Transition both to PROCESSING first, then fire concurrent payments
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PROCESSING" },
    });

    // Fire 2 concurrent recordPayment calls with DIFFERENT idempotencyKeys
    const promise1 = eventService.recordPayment(
      orderId,
      "250.0000",
      "ch_mock_1",
      `${idempotencyKey}-payment-1`
    );

    const promise2 = eventService.recordPayment(
      orderId,
      "250.0000",
      "ch_mock_2",
      `${idempotencyKey}-payment-2`
    );

    const results = await Promise.allSettled([promise1, promise2]);

    // Assert: exactly one resolves, one rejects
    const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;
    const rejectedCount = results.filter((r) => r.status === "rejected").length;
    expect(fulfilledCount).toBe(1);
    expect(rejectedCount).toBe(1);

    // Assert: only one PaymentConfirmed event in EventLog
    const events = await prisma.eventLog.findMany({
      where: { aggregateId: orderId, eventType: "PaymentConfirmed" },
    });
    expect(events).toHaveLength(1);
  });

  test("calculateFees: fee is exactly 3% of amount, rounded to 4dp", async () => {
    const cases: Array<[string, string]> = [
      ["100.0000", "3.0000"],
      ["999999.9900", "29999.9997"],
      ["1.0000", "0.0300"],
    ];

    for (const [amount, expectedFee] of cases) {
      const orderId = uuidv4();
      const idempotencyKey = `order-${orderId}`;

      // Create order first
      await eventService.recordOrder(
        orderId,
        "customer_123",
        "card",
        amount,
        idempotencyKey
      );

      // Calculate fees
      const event = await eventService.calculateFees(
        orderId,
        amount,
        `${idempotencyKey}-fees`
      );

      // Assert FeeCalculated event payload.fee matches expected
      expect((event.payload as any).fee).toBe(expectedFee);
    }
  });

  test("decimal precision: 10 orders of 0.0300 fees sum to exactly 0.3000", async () => {
    const amount = "1.0000";
    const expectedFee = "0.0300";
    const orderIds: string[] = [];

    for (let i = 0; i < 10; i++) {
      const orderId = uuidv4();
      const idempotencyKey = `order-${orderId}`;

      await eventService.recordOrder(
        orderId,
        "customer_123",
        "card",
        amount,
        idempotencyKey
      );

      await eventService.calculateFees(orderId, amount, `${idempotencyKey}-fees`);
      orderIds.push(orderId);
    }

    // Sum all fees_owed DEBIT ledger entries
    const result = await prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(debit), 0) as total FROM "Ledger" WHERE "account" = 'fees_owed'`
    ) as { total: string }[];

    expect(formatDecimal(toDecimal(result[0].total))).toBe("0.3000");
  });

  test("ledger balance: verifyLedgerBalance throws LedgerImbalanceError when ledger is manually corrupted", async () => {
    const orderId = uuidv4();
    const idempotencyKey = `order-${orderId}`;

    // Create an order via recordOrder
    await eventService.recordOrder(
      orderId,
      "customer_123",
      "card",
      "250.0000",
      idempotencyKey
    );

    // Directly insert a rogue Ledger row with a debit that has no matching credit
    await prisma.ledger.create({
      data: {
        orderId,
        account: "order_balance",
        debit: "100.0000",
        credit: null,
        description: "Rogue entry",
      },
    });

    // Assert: verifyLedgerBalance throws LedgerImbalanceError
    await expect(eventService.verifyLedgerBalance(orderId)).rejects.toThrow(LedgerImbalanceError);
  });
});
