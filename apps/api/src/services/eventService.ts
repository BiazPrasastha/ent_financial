import { PrismaClient, Prisma, EventLog, Order, Ledger } from "@prisma/client";
import {
  IdempotencyConflictError,
  VersionConflictError,
  LedgerImbalanceError,
  OrderNotFoundError,
} from "../lib/errors";
import { assertTransition } from "../lib/stateMachine";
import { formatDecimal, mulDecimal, toDecimal, FEE_RATE } from "../lib/decimal";
import Big from "big.js";

export class EventService {
  constructor(private readonly prisma: PrismaClient) {}

  async recordOrder(
    orderId: string,
    customerId: string,
    paymentMethod: string,
    amount: string,
    idempotencyKey: string
  ): Promise<{ order: Order; event: EventLog }> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.eventLog.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        // Verify the existing event matches this orderId (prevent stale key reuse)
        if (existing.aggregateId !== orderId) {
          throw new IdempotencyConflictError(idempotencyKey);
        }
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        return { order, event: existing };
      }

      const order = await tx.order.create({
        data: {
          id: orderId,
          customerId,
          paymentMethod,
          amount,
          status: "PENDING",
          version: 1,
        },
      });

      const event = await tx.eventLog.create({
        data: {
          aggregateId: orderId,
          eventType: "OrderCreated",
          payload: { amount, customerId, paymentMethod },
          version: 1,
          idempotencyKey,
        },
      });

      await tx.ledger.create({
        data: {
          orderId,
          account: "order_balance",
          debit: amount,
          credit: null,
          description: "Order created",
        },
      });

      await tx.ledger.create({
        data: {
          orderId,
          account: "order_pending",
          debit: null,
          credit: amount,
          description: "Order pending",
        },
      });

      return { order, event };
    });
  }

  async recordPayment(
    orderId: string,
    amount: string,
    stripeChargeId: string,
    idempotencyKey: string
  ): Promise<EventLog> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.eventLog.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        // Verify the existing event matches this orderId (prevent stale key reuse)
        if (existing.aggregateId !== orderId) {
          throw new IdempotencyConflictError(idempotencyKey);
        }
        return existing;
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      assertTransition(order.status, "PAID", orderId);

      try {
        await tx.order.update({
          where: { id: orderId, version: order.version },
          data: {
            version: { increment: 1 },
            status: "PAID",
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

      const event = await tx.eventLog.create({
        data: {
          aggregateId: orderId,
          eventType: "PaymentConfirmed",
          payload: { amount, stripeChargeId },
          version: order.version + 1,
          idempotencyKey,
        },
      });

      await tx.ledger.create({
        data: {
          orderId,
          account: "payment_received",
          debit: amount,
          credit: null,
          description: "Payment received",
        },
      });

      await tx.ledger.create({
        data: {
          orderId,
          account: "order_balance",
          debit: null,
          credit: amount,
          description: "Order balance cleared",
        },
      });

      return event;
    });
  }

  async calculateFees(
    orderId: string,
    amount: string,
    idempotencyKey: string
  ): Promise<EventLog> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.eventLog.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        // Verify the existing event matches this orderId (prevent stale key reuse)
        if (existing.aggregateId !== orderId) {
          throw new IdempotencyConflictError(idempotencyKey);
        }
        return existing;
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      try {
        await tx.order.update({
          where: { id: orderId, version: order.version },
          data: {
            version: { increment: 1 },
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

      const fee = mulDecimal(toDecimal(amount), FEE_RATE);
      const feeStr = formatDecimal(fee);

      const event = await tx.eventLog.create({
        data: {
          aggregateId: orderId,
          eventType: "FeeCalculated",
          payload: { amount, fee: feeStr },
          version: order.version + 1,
          idempotencyKey,
        },
      });

      await tx.ledger.create({
        data: {
          orderId,
          account: "fees_owed",
          debit: feeStr,
          credit: null,
          description: "Fee calculated",
        },
      });

      await tx.ledger.create({
        data: {
          orderId,
          account: "payment_received",
          debit: null,
          credit: feeStr,
          description: "Fee deducted from payment",
        },
      });

      return event;
    });
  }

  async verifyLedgerBalance(orderId: string): Promise<boolean> {
    const result = await this.prisma.$queryRawUnsafe(
      `SELECT
        COALESCE(SUM(debit), 0) as total_debit,
        COALESCE(SUM(credit), 0) as total_credit
      FROM "Ledger"
      WHERE "orderId" = $1`,
      orderId
    ) as { total_debit: string; total_credit: string }[];

    const totalDebit = toDecimal(result[0].total_debit);
    const totalCredit = toDecimal(result[0].total_credit);
    const delta = totalDebit.minus(totalCredit);
    const isBalanced = delta.eq("0");

    if (!isBalanced) {
      throw new LedgerImbalanceError(orderId, formatDecimal(delta));
    }

    return true;
  }

  async getOrderEvents(orderId: string): Promise<EventLog[]> {
    return this.prisma.eventLog.findMany({
      where: { aggregateId: orderId },
      orderBy: { version: "asc" },
    });
  }

  async getOrderLedger(orderId: string): Promise<Ledger[]> {
    return this.prisma.ledger.findMany({
      where: { orderId },
      orderBy: { timestamp: "asc" },
    });
  }
}

export default EventService;
