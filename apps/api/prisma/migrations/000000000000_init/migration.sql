-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('OrderCreated', 'PaymentProcessing', 'PaymentConfirmed', 'FeeCalculated', 'OrderShipped', 'OrderDelivered', 'SettlementProcessed');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('order_balance', 'order_pending', 'payment_received', 'fees_owed', 'seller_payout');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'SHIPPED', 'DELIVERED', 'REFUNDED', 'SETTLED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "account" "AccountType" NOT NULL,
    "debit" DECIMAL(18,4),
    "credit" DECIMAL(18,4),
    "description" TEXT NOT NULL DEFAULT '',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventLog_idempotencyKey_key" ON "EventLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EventLog_aggregateId_version_idx" ON "EventLog"("aggregateId", "version");

-- CreateIndex
CREATE INDEX "EventLog_eventType_idx" ON "EventLog"("eventType");

-- CreateIndex
CREATE INDEX "EventLog_timestamp_idx" ON "EventLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "EventLog_aggregateId_version_key" ON "EventLog"("aggregateId", "version");

-- CreateIndex
CREATE INDEX "Ledger_orderId_idx" ON "Ledger"("orderId");

-- CreateIndex
CREATE INDEX "Ledger_timestamp_idx" ON "Ledger"("timestamp");

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_aggregateId_fkey" FOREIGN KEY ("aggregateId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ledger"
  ADD CONSTRAINT chk_ledger_debit_xor_credit
  CHECK (
    (debit IS NOT NULL AND credit IS NULL)
    OR
    (debit IS NULL AND credit IS NOT NULL)
  );
