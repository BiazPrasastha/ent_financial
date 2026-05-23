export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface OrderData {
  id: string;
  customerId: string;
  paymentMethod: string;
  amount: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderResponse {
  orderId: string;
  amount: string;
  status: string;
  fees: string;
  netPayout: string;
  eventId: string;
}

export interface PayOrderResponse {
  orderId: string;
  chargeId: string;
  status: string;
  eventId: string;
}

export async function fetchOrder(orderId: string): Promise<OrderData> {
  const res = await fetch(`${API_URL}/orders/${orderId}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to fetch order ${orderId}`);
  }

  const json = await res.json();
  return json.data as OrderData;
}

export async function createOrder(
  customerId: string,
  paymentMethod: string,
  amount: string,
  idempotencyKey: string
): Promise<CreateOrderResponse> {
  const res = await fetch(`${API_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ customerId, paymentMethod, amount }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create order");
  }

  const json = await res.json();
  return json.data as CreateOrderResponse;
}

export async function payOrder(
  orderId: string,
  amount: string,
  idempotencyKey: string
): Promise<PayOrderResponse> {
  const res = await fetch(`${API_URL}/orders/${orderId}/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ amount }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to pay order");
  }

  const json = await res.json();
  return json.data as PayOrderResponse;
}

export async function fetchLedger(
  orderId: string
): Promise<{
  entries: any[];
  runningBalance: string;
  isBalanced: boolean;
}> {
  const res = await fetch(`${API_URL}/orders/${orderId}/ledger`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to fetch ledger");
  }

  const json = await res.json();
  return json.data;
}

const STORAGE_KEY = "entropi_recent_orders";

export function getRecentOrders(): { id: string; customerId: string; amount: string; createdAt: string }[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addRecentOrder(order: { id: string; customerId: string; amount: string; createdAt: string }): void {
  if (typeof window === "undefined") return;
  const orders = getRecentOrders().filter((o) => o.id !== order.id);
  orders.unshift(order);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.slice(0, 20)));
}
