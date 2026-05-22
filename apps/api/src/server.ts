import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import prismaPlugin from './plugins/prisma';
import {
  VersionConflictError, IdempotencyConflictError, InvalidTransitionError,
  StripeError, CardDeclinedError, LedgerImbalanceError, OrderNotFoundError
} from './lib/errors';

// Known typed errors union (for narrowing in error handler)
type AppError =
  | VersionConflictError | IdempotencyConflictError | InvalidTransitionError
  | StripeError | CardDeclinedError | LedgerImbalanceError | OrderNotFoundError;

function isAppError(e: unknown): e is AppError {
  return e instanceof Error && 'statusCode' in e && 'code' in e;
}

/**
 * Build and configure the Fastify app.
 * Does NOT call listen() — use start() for that.
 * Export buildApp for test reuse.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(cors, { origin: true });
  await app.register(prismaPlugin);

  app.register((await import('./routes/orders')).default);
  app.register((await import('./routes/settlement')).default);

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }
    app.log.error(error);
    return reply.status(500).send({
      error: 'Internal server error',
      code: 'INTERNAL',
    });
  });

  return app;
}

/**
 * Start the server. Entry point for production.
 */
export async function start(): Promise<void> {
  const app = await buildApp();
  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API listening on port ${port}`);
}

// Only auto-start when this file is run directly
if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
