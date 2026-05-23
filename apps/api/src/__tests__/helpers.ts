import { PrismaClient } from "@prisma/client";
import { EventService } from "../services/eventService";
import { StripeService } from "../services/stripeService";

export async function createPaidOrder(
  prisma: PrismaClient,
  eventService: EventService,
  stripeService: StripeService,
  orderId: string,
  amount: string
): Promise<void> {
  const customerId = "customer_123";
  const paymentMethod = "card";
  const idempotencyKey = `order-${orderId}`;

  // 1. recordOrder
  await eventService.recordOrder(
    orderId,
    customerId,
    paymentMethod,
    amount,
    idempotencyKey
  );

  // 2. calculateFees
  await eventService.calculateFees(orderId, amount, `${idempotencyKey}-fees`);

  // 3. Transition PENDING -> PROCESSING (required by state machine before PAID)
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PROCESSING" },
  });

  // 4. stripeService.processPayment
  const stripeResult = await stripeService.processPayment(
    orderId,
    amount,
    customerId,
    `${idempotencyKey}-payment`
  );

  // 5. recordPayment (PROCESSING -> PAID)
  await eventService.recordPayment(
    orderId,
    amount,
    stripeResult.chargeId,
    `${idempotencyKey}-payment`
  );
}
