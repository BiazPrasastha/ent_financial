import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { SettlementService } from "../services/settlementService";

export default fp(async (app: FastifyInstance) => {
  const settlementService = new SettlementService(app.prisma);

  app.post(
    "/settle",
    {
      schema: {
        body: {
          type: "object",
          required: ["date"],
          properties: {
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
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

      const { date } = request.body as { date: string };

      const result = await settlementService.dailySettlement(date);

      return reply.status(200).send({
        data: result,
      });
    }
  );
});
