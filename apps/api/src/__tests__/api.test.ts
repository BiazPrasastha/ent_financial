import { PrismaClient } from "@prisma/client";
import { buildApp } from "../server";
import { FastifyInstance } from "fastify";
import supertest from "supertest";
import { v4 as uuidv4 } from "uuid";
import { formatDecimal, toDecimal } from "../lib/decimal";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://user:pass@localhost:5432/entropi_test";

let app: FastifyInstance;
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });
  app = await buildApp();
  await app.ready();
});

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE TABLE "Ledger", "EventLog", "Order" CASCADE;`;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /orders", () => {
  const validBody = { customerId: "cust_001", paymentMethod: "card", amount: "250.0000" };

  test("creates an order and returns 201", async () => {
    const key = `order-${uuidv4()}`;
    const res = await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", key)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      amount: "250.0000",
      status: "PENDING",
    });
    expect(res.body.data.orderId).toBe(key);
    expect(res.body.data.fees).toBe("7.5000");
    expect(res.body.data.netPayout).toBe("242.5000");
  });

  test("returns 400 when idempotency-key header is missing", async () => {
    const res = await supertest(app.server)
      .post("/orders")
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  test("returns 400 for invalid amount format", async () => {
    const res = await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", `order-${uuidv4()}`)
      .send({ ...validBody, amount: "not_a_number" });

    expect(res.status).toBe(400);
  });

  test("idempotency: same key returns same orderId", async () => {
    const key = `order-${uuidv4()}`;

    const res1 = await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", key)
      .send(validBody);

    const res2 = await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", key)
      .send(validBody);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res2.body.data.orderId).toBe(res1.body.data.orderId);
    expect(res2.body.data.amount).toBe(res1.body.data.amount);
  });
});

describe("POST /orders/:id/pay", () => {
  test("processes payment and returns 200", async () => {
    const orderId = `order-${uuidv4()}`;
    const payKey = `pay-${uuidv4()}`;

    // Create order first (idempotency key = orderId)
    await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", orderId)
      .send({ customerId: "cust_001", paymentMethod: "card", amount: "100.0000" });

    // Transition to PROCESSING before payment
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PROCESSING" },
    });

    // Pay
    const res = await supertest(app.server)
      .post(`/orders/${orderId}/pay`)
      .set("idempotency-key", payKey)
      .send({ amount: "100.0000" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PAID");
    expect(res.body.data.chargeId).toMatch(/^ch_mock_/);
  });

  test("returns 404 for nonexistent order", async () => {
    const res = await supertest(app.server)
      .post(`/orders/${uuidv4()}/pay`)
      .set("idempotency-key", `pay-${uuidv4()}`)
      .send({ amount: "100.0000" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORDER_NOT_FOUND");
  });
});

describe("GET /orders/:id", () => {
  test("returns order details", async () => {
    const orderId = `order-${uuidv4()}`;

    await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", orderId)
      .send({ customerId: "cust_001", paymentMethod: "card", amount: "250.0000" });

    const res = await supertest(app.server).get(`/orders/${orderId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: orderId,
      customerId: "cust_001",
      paymentMethod: "card",
      status: "PENDING",
    });
  });

  test("returns 404 for nonexistent order", async () => {
    const res = await supertest(app.server).get(`/orders/${uuidv4()}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORDER_NOT_FOUND");
  });
});

describe("GET /orders/:id/ledger", () => {
  test("returns ledger entries with running balance", async () => {
    const orderId = `order-${uuidv4()}`;

    await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", orderId)
      .send({ customerId: "cust_001", paymentMethod: "card", amount: "250.0000" });

    const res = await supertest(app.server).get(`/orders/${orderId}/ledger`);

    expect(res.status).toBe(200);
    expect(res.body.data.entries).toHaveLength(4);
    expect(res.body.data.isBalanced).toBe(true);
    expect(res.body.data.runningBalance).toBe("0.0000");
  });
});

describe("GET /verify-ledger/:id", () => {
  test("returns true for balanced order", async () => {
    const orderId = `order-${uuidv4()}`;

    await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", orderId)
      .send({ customerId: "cust_001", paymentMethod: "card", amount: "250.0000" });

    const res = await supertest(app.server).get(`/verify-ledger/${orderId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isBalanced).toBe(true);
  });

  test("returns 404 for nonexistent order", async () => {
    const res = await supertest(app.server).get(`/verify-ledger/${uuidv4()}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /settle", () => {
  test("settles PAID orders and returns result", async () => {
    const orderId = `order-${uuidv4()}`;
    const payKey = `pay-${uuidv4()}`;

    // Create order
    await supertest(app.server)
      .post("/orders")
      .set("idempotency-key", orderId)
      .send({ customerId: "cust_001", paymentMethod: "card", amount: "100.0000" });

    // Transition to PROCESSING then pay
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PROCESSING" },
    });

    await supertest(app.server)
      .post(`/orders/${orderId}/pay`)
      .set("idempotency-key", payKey)
      .send({ amount: "100.0000" });

    // Settle
    const res = await supertest(app.server)
      .post("/settle")
      .set("idempotency-key", `settle-${uuidv4()}`)
      .send({ date: "2025-01-01" });

    expect(res.status).toBe(200);
    expect(res.body.data.ordersSettled).toBe(1);
    expect(res.body.data.ordersSkipped).toBe(0);
    expect(res.body.data.totalPayout).toBe("97.0000");
  });

  test("returns 400 when idempotency-key header is missing", async () => {
    const res = await supertest(app.server)
      .post("/settle")
      .send({ date: "2025-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });
});
