import { PrismaClient } from "@prisma/client";
import { EventService } from "../services/eventService";
import { SettlementService } from "../services/settlementService";
import { StripeService } from "../services/stripeService";
import { formatDecimal, toDecimal } from "../lib/decimal";
import { v4 as uuidv4 } from "uuid";
import { createPaidOrder } from "./helpers";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://user:pass@localhost:5432/entropi";

let prisma: PrismaClient;
let eventService: EventService;
let settlementService: SettlementService;
let stripeService: StripeService;

describe("SettlementService", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    eventService = new EventService(prisma);
    settlementService = new SettlementService(prisma);
    stripeService = new StripeService();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "Ledger", "EventLog", "Order" CASCADE;`;
    stripeService.reset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("settlement idempotency: running dailySettlement twice produces same result", async () => {
    // Create 3 PAID orders
    const orderIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const orderId = uuidv4();
      await createPaidOrder(
        prisma,
        eventService,
        stripeService,
        orderId,
        "100.0000"
      );
      orderIds.push(orderId);
    }

    // Call dailySettlement("2025-01-01") twice
    const firstResult = await settlementService.dailySettlement("2025-01-01");
    const secondResult = await settlementService.dailySettlement("2025-01-01");

    // Assert: second call returns ordersSettled=0, ordersSkipped=0 (no PAID orders found)
    expect(secondResult.ordersSettled).toBe(0);
    expect(secondResult.ordersSkipped).toBe(0);

    // Assert: total seller_payout DEBIT rows = 3 (not 6)
    const sellerPayoutEntries = await prisma.ledger.findMany({
      where: { account: "seller_payout" },
    });
    expect(sellerPayoutEntries).toHaveLength(3);

    // Assert: verifyLedgerBalance is true for all 3 orders
    for (const orderId of orderIds) {
      const isBalanced = await eventService.verifyLedgerBalance(orderId);
      expect(isBalanced).toBe(true);
    }
  });

  test("invalid transition: settling an already-SETTLED order is skipped", async () => {
    // Create an order and settle it
    const orderId = uuidv4();
    await createPaidOrder(
      prisma,
      eventService,
      stripeService,
      orderId,
      "100.0000"
    );

    // First settlement
    await settlementService.dailySettlement("2025-01-01");

    // Manually update status back to PAID
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAID" },
    });

    // Run settlement again with same date (idempotent)
    const result = await settlementService.dailySettlement("2025-01-01");

    // Assert: order not double-settled (event idempotency key prevents it)
    const events = await prisma.eventLog.findMany({
      where: { aggregateId: orderId, eventType: "SettlementProcessed" },
    });
    expect(events).toHaveLength(1);
  });

  test("projection consistency: getSettlementSummary totals match actual ledger sums", async () => {
    // Create 5 PAID orders with various amounts
    const amounts = ["100.0000", "200.0000", "300.0000", "400.0000", "500.0000"];
    for (const amount of amounts) {
      const orderId = uuidv4();
      await createPaidOrder(
        prisma,
        eventService,
        stripeService,
        orderId,
        amount
      );
    }

    // Use a fixed date so timestamp-based queries in getSettlementSummary match
    const date = "2025-01-01";

    // Run dailySettlement
    await settlementService.dailySettlement(date);

    // Assert: getSettlementSummary totalPayout === sum of seller_payout DEBIT rows in Ledger
    const summary = await settlementService.getSettlementSummary(date);

    const result = await prisma.$queryRawUnsafe<{ total: string }[]>(
      `SELECT COALESCE(SUM(debit), 0) as total FROM "Ledger" WHERE "account" = 'seller_payout'`
    );

    // Normalize to 4dp strings for comparison
    expect(formatDecimal(toDecimal(summary.totalPayout))).toBe(formatDecimal(toDecimal(result[0].total)));
  });
});
