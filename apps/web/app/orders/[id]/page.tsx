"use client"

import { useState } from "react"
import OrderStatusCard from "../../../components/OrderStatusCard"
import LedgerAuditTrail from "../../../components/LedgerAuditTrail"
import EventTimeline from "../../../components/EventTimeline"

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <div className="mb-4">
        <a
          href="/orders"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Orders
        </a>
      </div>
      <h1 className="text-base font-semibold text-gray-900 mb-6">Order details</h1>
      <div className="space-y-6">
        <OrderStatusCard orderId={id} onPaySuccess={() => setRefreshKey((k) => k + 1)} />
        <LedgerAuditTrail orderId={id} refreshKey={refreshKey} />
        <EventTimeline orderId={id} refreshKey={refreshKey} />
      </div>
    </>
  )
}
