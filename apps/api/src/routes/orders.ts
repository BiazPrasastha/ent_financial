import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { EventService } from "../services/eventService";
import { StripeService } from "../services/stripeService";
import { toDecimal, formatDecimal } from "../lib/decimal";
import { Prisma } from "@prisma/client";

const stripeService = new StripeService();

export default fp(async (app: FastifyInstance) => {
  const eventService = new EventService(app.prisma);

  app.post(
    "/orders",
    {
      schema: {
        body: {
          type: "object",
          required: ["customerId", "paymentMethod", "amount"],
          properties: {
            customerId: { type: "string" },
            paymentMethod: { type: "string" },
            amount: {
              type: "string",
              pattern: "^[0-9]+\\.[0-9]{1,4}$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const idempotencyKey = (request.headers["idempotency-key"] as string) || "";
      if (!idempotencyKey) {
        return reply.status(400).send({
          error: "idempotency-key header required",
          code: "MISSING_IDEMPOTENCY_KEY",
        });
      }

      const { customerId, paymentMethod, amount } = request.body as {
        customerId: string;
        paymentMethod: string;
        amount: string;
      };

      const { order } = await eventService.recordOrder(
        idempotencyKey,
        customerId,
        paymentMethod,
        amount,
        idempotencyKey
      );

      // Calculate fees in the same request (idempotent key suffix)
      await eventService.calculateFees(
        order.id,
        amount,
        `${idempotencyKey}-fees`
      );

      const fees = toDecimal(amount).times("0.03");
      const netPayout = toDecimal(amount).minus(fees);

      return reply.status(201).send({
        data: {
          orderId: order.id,
          amount: formatDecimal(toDecimal(order.amount)),
          status: order.status,
          fees: formatDecimal(fees),
          netPayout: formatDecimal(netPayout),
          eventId: "",
        },
      });
    }
  );

  app.post(
    "/orders/:id/pay",
    {
      schema: {
        body: {
          type: "object",
          required: ["amount"],
          properties: {
            amount: {
              type: "string",
              pattern: "^[0-9]+\\.[0-9]{1,4}$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const idempotencyKey = (request.headers["idempotency-key"] as string) || "";
      if (!idempotencyKey) {
        return reply.status(400).send({
          error: "idempotency-key header required",
          code: "MISSING_IDEMPOTENCY_KEY",
        });
      }

      const { id } = request.params as { id: string };
      const { amount } = request.body as { amount: string };

      const order = await app.prisma.order.findUnique({
        where: { id },
      });

      if (!order) {
        return reply.status(404).send({
          error: `Order not found: ${id}`,
          code: "ORDER_NOT_FOUND",
        });
      }

      const stripeResult = await stripeService.processPayment(
        id,
        amount,
        order.customerId,
        idempotencyKey
      );

      const event = await eventService.recordPayment(
        id,
        amount,
        stripeResult.chargeId,
        idempotencyKey
      );

      return reply.status(200).send({
        data: {
          orderId: id,
          chargeId: stripeResult.chargeId,
          status: "PAID",
          eventId: event.id,
        },
      });
    }
  );

  app.get("/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const order = await app.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return reply.status(404).send({
        error: `Order not found: ${id}`,
        code: "ORDER_NOT_FOUND",
      });
    }

    return reply.status(200).send({
      data: {
        id: order.id,
        customerId: order.customerId,
        paymentMethod: order.paymentMethod,
        amount: formatDecimal(toDecimal(order.amount)),
        status: order.status,
        version: order.version,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
    });
  });

  app.get("/orders/:id/ledger", async (request, reply) => {
    const { id } = request.params as { id: string };

    const order = await app.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return reply.status(404).send({
        error: `Order not found: ${id}`,
        code: "ORDER_NOT_FOUND",
      });
    }

    const entries = await eventService.getOrderLedger(id);
    let runningBalance = toDecimal("0");

    const mappedEntries = entries.map((entry) => {
      const debit = entry.debit ? toDecimal(entry.debit) : toDecimal("0");
      const credit = entry.credit ? toDecimal(entry.credit) : toDecimal("0");
      runningBalance = runningBalance.plus(debit).minus(credit);

      return {
        id: entry.id,
        account: entry.account,
        debit: entry.debit,
        credit: entry.credit,
        description: entry.description,
        timestamp: entry.timestamp.toISOString(),
      };
    });

    const isBalanced = runningBalance.eq("0");

    return reply.status(200).send({
      data: {
        entries: mappedEntries,
        runningBalance: formatDecimal(runningBalance),
        isBalanced,
      },
    });
  });

  app.get("/verify-ledger/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const order = await app.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return reply.status(404).send({
        error: `Order not found: ${id}`,
        code: "ORDER_NOT_FOUND",
      });
    }

    const isBalanced = await eventService.verifyLedgerBalance(id);

    return reply.status(200).send({
      data: {
        orderId: id,
        isBalanced,
      },
    });
  });
});
