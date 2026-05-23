import { PrismaClient } from "@prisma/client";
import { EventService } from "../services/eventService";
import { v4 as uuidv4 } from "uuid";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://user:pass@localhost:5432/entropi";

let prisma: PrismaClient;
let eventService: EventService;

describe("Concurrency", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    eventService = new EventService(prisma);
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "Ledger", "EventLog", "Order" CASCADE;`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test(
    "100 concurrent recordOrder calls: all recorded, no duplicates, each ledger balanced",
    async () => {
      // Generate 100 unique orderId + idempotencyKey pairs
      const pairs = Array.from({ length: 100 }, () => {
        const orderId = uuidv4();
        return {
          orderId,
          idempotencyKey: `order-${orderId}`,
        };
      });

      // Fire all 100 recordOrder calls concurrently via Promise.all
      await Promise.all(
        pairs.map(({ orderId, idempotencyKey }) =>
          eventService.recordOrder(
            orderId,
            "customer_123",
            "card",
            "100.0000",
            idempotencyKey
          )
        )
      );

      // Assert: 100 Orders in DB
      const orderCount = await prisma.order.count();
      expect(orderCount).toBe(100);

      // Assert: 100 EventLog rows with eventType OrderCreated
      const eventCount = await prisma.eventLog.count({
        where: { eventType: "OrderCreated" },
      });
      expect(eventCount).toBe(100);

      // Assert: 200 Ledger rows (2 per order)
      const ledgerCount = await prisma.ledger.count();
      expect(ledgerCount).toBe(200);

      // Assert: for every orderId, verifyLedgerBalance returns true
      for (const { orderId } of pairs) {
        const isBalanced = await eventService.verifyLedgerBalance(orderId);
        expect(isBalanced).toBe(true);
      }
    },
    30_000
  );
});
