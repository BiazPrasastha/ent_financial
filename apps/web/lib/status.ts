import type { OrderStatus } from './api'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING:    'Pending',
  PROCESSING: 'Processing',
  PAID:       'Paid',
  SHIPPED:    'Shipped',
  DELIVERED:  'Delivered',
  REFUNDED:   'Refunded',
  SETTLED:    'Settled',
}

export const STATUS_CLASSES: Record<OrderStatus, string> = {
  PENDING:    'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROCESSING: 'bg-blue-100   text-blue-800   border-blue-200',
  PAID:       'bg-green-100  text-green-800  border-green-200',
  SHIPPED:    'bg-purple-100 text-purple-800 border-purple-200',
  DELIVERED:  'bg-teal-100   text-teal-800   border-teal-200',
  REFUNDED:   'bg-red-100    text-red-800    border-red-200',
  SETTLED:    'bg-gray-100   text-gray-700   border-gray-200',
}

export const TERMINAL_STATUSES: OrderStatus[] = [
  'REFUNDED', 'SETTLED', 'DELIVERED'
]

export const PROGRESS_STEPS: OrderStatus[] = [
  'PENDING', 'PROCESSING', 'PAID', 'SETTLED'
]

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function stepIndex(status: OrderStatus): number {
  const idx = PROGRESS_STEPS.indexOf(status)
  return idx === -1 ? 0 : idx
}

export const ACCOUNT_LABELS: Record<string, string> = {
  order_balance:    'Order balance',
  order_pending:    'Order pending',
  payment_received: 'Payment received',
  fees_owed:        'Fees owed',
  seller_payout:    'Seller payout',
}
