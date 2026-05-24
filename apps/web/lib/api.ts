export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export type AmountString = string

export type OrderStatus =
  | 'PENDING' | 'PROCESSING' | 'PAID'
  | 'SHIPPED' | 'DELIVERED' | 'REFUNDED' | 'SETTLED'

export interface Order {
  id: string
  customerId: string
  paymentMethod: string
  amount: AmountString
  status: OrderStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface LedgerEntry {
  id: string
  account: string
  debit: AmountString | null
  credit: AmountString | null
  description: string
  timestamp: string
}

export interface LedgerResponse {
  entries: LedgerEntry[]
  runningBalance: AmountString
  isBalanced: boolean
}

export interface CreateOrderResponse {
  orderId: string
  amount: AmountString
  status: OrderStatus
  fees: AmountString
  netPayout: AmountString
  eventId: string
}

export interface PayOrderResponse {
  orderId: string
  chargeId: string
  status: OrderStatus
  eventId: string
}

export interface SettlementResult {
  date: string
  ordersSettled: number
  ordersSkipped: number
  totalPayout: AmountString
  orderIds: string[]
}

export interface ApiError {
  error: string
  code: string
  details?: unknown
}

export async function fetchOrder(orderId: string): Promise<Order> {
  const res = await fetch(`${API_URL}/orders/${orderId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as Order
}

export async function fetchLedger(
  orderId: string
): Promise<LedgerResponse> {
  const res = await fetch(`${API_URL}/orders/${orderId}/ledger`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as LedgerResponse
}

export async function verifyLedger(
  orderId: string
): Promise<{ orderId: string; isBalanced: boolean }> {
  const res = await fetch(`${API_URL}/verify-ledger/${orderId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as { orderId: string; isBalanced: boolean }
}

export async function fetchOrders(status?: OrderStatus): Promise<Order[]> {
  const url = status ? `${API_URL}/orders?status=${status}` : `${API_URL}/orders`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as Order[]
}

export async function fetchSettlementSummary(date: string): Promise<{
  date: string
  totalPayout: AmountString
  ordersSettled: number
}> {
  const res = await fetch(`${API_URL}/settle?date=${date}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as { date: string; totalPayout: AmountString; ordersSettled: number }
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
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as CreateOrderResponse
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
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as PayOrderResponse
}

export async function runSettlement(
  date: string,
  idempotencyKey: string
): Promise<SettlementResult> {
  const res = await fetch(`${API_URL}/settle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ date }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as SettlementResult
}

export async function fetchEvents(
  orderId: string
): Promise<Array<{
  id: string
  type: string
  version: number
  data: string
  idempotencyKey: string
  timestamp: string
}>> {
  const res = await fetch(`${API_URL}/orders/${orderId}/events`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError
    throw body
  }
  const json = await res.json()
  return json.data as Array<{
    id: string
    type: string
    version: number
    data: string
    idempotencyKey: string
    timestamp: string
  }>
}
