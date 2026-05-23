# Entropi — Financial Order Management System

Submission Reference: **Ent-JFE-20/05/26**

## Quick Start

```bash
# Install dependencies
pnpm install

# Run database migrations (ensure DATABASE_URL is set)
pnpm --filter api exec prisma migrate deploy

# Start development servers
pnpm dev:api   # API on http://localhost:3001
pnpm dev:web   # Frontend on http://localhost:3000
```

## Architecture Diagram

```mermaid
flowchart LR
    Client["Client (Next.js / Vercel)"] -->|HTTP/REST| Fastify["Fastify API (Railway)"]
    Fastify --> Prisma["Prisma ORM"]
    Prisma --> PostgreSQL[("PostgreSQL (Supabase)")]
    Fastify --> StripeMock["Stripe Mock Service (in-memory idempotency)"]

    Prisma --> EventLog[("EventLog (immutable events)")]
    Prisma --> Ledger[("Ledger (double-entry financials)")]
    Prisma --> Order[("Order (aggregate root)")]
```

## Deployment

| Service     | URL / Provider              |
| :---------- | :-------------------------- |
| Frontend    | Vercel (Next.js 14)         |
| Backend API | Railway (Fastify 4)         |
| Database    | Supabase (PostgreSQL 15)    |

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) — System design, ledger model, and key decisions
- [Concurrency Strategy](docs/CONCURRENCY.md) — Optimistic locking, idempotency, and transaction scoping
- [Financial Rules](docs/FINANCIAL_RULES.md) — Currency representation, fee math, double-entry ledger

## Running Tests

```bash
# Ensure TEST_DATABASE_URL is set to a PostgreSQL instance
export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/entropi_test"

# Run all API tests (serially, due to DB state)
pnpm --filter api test
```

### Test Suite Breakdown

| File                         | Tests                            |
| :--------------------------- | :------------------------------- |
| `eventService.test.ts`       | 7 tests covering happy path, idempotency, version conflicts, decimal precision |
| `concurrency.test.ts`        | 1 test firing 100 concurrent orders to verify no corruption |
| `settlement.test.ts`         | 3 tests for settlement idempotency, invalid transitions, and projection consistency |

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, TypeScript strict
- **Backend**: Fastify 4, Prisma ORM 5, big.js (decimal math)
- **Database**: PostgreSQL 15 (Supabase)
- **Testing**: Jest, ts-jest, Supertest
