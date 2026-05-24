import { PrismaClient, EventLog, Order, Prisma } from "@prisma/client";
import { formatDecimal, toDecimal } from "../lib/decimal";
import Big from "big.js";
import { assertTransition } from "../lib/stateMachine";
import {
  LedgerImbalanceError,
  VersionConflictError,
  OrderNotFoundError,
} from "../lib/errors";

export interface SettlementResult {
  date: string;
  ordersSettled: number;
  ordersSkipped: number; // already settled
  totalPayout: string; // formatted Decimal string
  orderIds: string[];
}

export class SettlementService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Run daily settlement for a given date.
   * Finds all PAID orders, settles each idempotently.
   * IDEMPOTENT: calling twice with same date returns same result.
   *
   * @param date - "YYYY-MM-DD"
   */
  async dailySettlement(date: string): Promise<SettlementResult> {
    const orders = await this.prisma.order.findMany({
      where: { status: "PAID" },
    });

    let totalPayout = toDecimal("0");
    const orderIds: string[] = [];
    let ordersSettled = 0;
    let ordersSkipped = 0;

    for (const order of orders) {
      const orderId = order.id;
      const key = `settlement-${date}-${orderId}`;

      try {
        const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          // Idempotency check
          const existing = await tx.eventLog.findUnique({
            where: { idempotencyKey: key },
          });

          if (existing) {
            return { skipped: true, orderId, totalPayout: toDecimal("0") };
          }

          assertTransition(order.status, "SETTLED", orderId);

          // Optimistic lock version bump
          try {
            await tx.order.update({
              where: { id: orderId, version: order.version },
              data: {
                version: { increment: 1 },
                status: "SETTLED",
              },
            });
          } catch (err: any) {
            if (err.code === "P2025") {
              throw new VersionConflictError(
                orderId,
                order.version,
                order.version + 1
              );
            }
            throw err;
          }

          // Get net payout (order.amount - fees_owed)
          const fees = await this.getNetPayout(orderId, tx);
          const netAmount = toDecimal(order.amount).minus(toDecimal(fees));
          const netAmountStr = formatDecimal(netAmount);

          // Create EventLog
          await tx.eventLog.create({
            data: {
              aggregateId: orderId,
              eventType: "SettlementProcessed",
              payload: { amount: netAmountStr, date },
              version: order.version + 1,
              idempotencyKey: key,
            },
          });

          // Create Ledger entries with timestamp matching the settlement date (local time)
          const settlementTimestamp = new Date(`${date}T23:59:59.999`);

          await tx.ledger.create({
            data: {
              orderId,
              account: "seller_payout",
              debit: netAmountStr,
              credit: null,
              description: "Seller payout",
              timestamp: settlementTimestamp,
            },
          });

          await tx.ledger.create({
            data: {
              orderId,
              account: "payment_received",
              debit: null,
              credit: netAmountStr,
              description: "Payment received settlement",
              timestamp: settlementTimestamp,
            },
          });

          return { skipped: false, orderId, totalPayout: netAmount };
        });

        if (result.skipped) {
          ordersSkipped++;
        } else {
          totalPayout = totalPayout.plus(result.totalPayout);
          orderIds.push(result.orderId);
          ordersSettled++;
        }
      } catch (err) {
        // Log error but continue processing other orders
        console.error(`Settlement failed for order ${orderId}:`, err);
      }
    }

    return {
      date,
      ordersSettled,
      ordersSkipped,
      totalPayout: formatDecimal(totalPayout),
      orderIds,
    };
  }

  /**
   * Return summary of a past settlement run.
   * Sums all seller_payout DEBIT entries on given date.
   */
  async getSettlementSummary(date: string): Promise<{
    date: string;
    totalPayout: string;
    ordersSettled: number;
  }> {
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59.999`);

    const result = await this.prisma.$queryRawUnsafe(
      `SELECT
        COALESCE(SUM(debit), 0) as total_payout,
        COUNT(DISTINCT "orderId") as orders_settled
      FROM "Ledger"
      WHERE "account" = 'seller_payout'
        AND "timestamp" >= $1 AND "timestamp" <= $2`,
      startOfDay,
      endOfDay
    ) as { total_payout: string; orders_settled: number }[];

    return {
      date,
      totalPayout: result[0].total_payout ?? "0.0000",
      ordersSettled: result[0].orders_settled ?? 0,
    };
  }

  /**
   * Helper: get net payout amount for one order
   * = order.amount - fees_owed (sum of fees_owed DEBIT ledger rows)
   */
  private async getNetPayout(
    orderId: string,
    tx: Prisma.TransactionClient
  ): Promise<string> {
    const result =
      await tx.$queryRawUnsafe(
        `SELECT COALESCE(SUM(debit), 0) as total_fees FROM "Ledger" WHERE "orderId" = $1 AND "account" = 'fees_owed'`,
        orderId
      ) as { total_fees: string | null }[];

    const totalFees = result[0].total_fees ?? "0.0000";
    return totalFees;
  }
}
