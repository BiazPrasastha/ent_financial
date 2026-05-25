"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchOrder, payOrder, type Order } from "../lib/api"
import { calcFee, calcNet, formatAmount } from "../lib/decimal"
import { STATUS_LABEL, STATUS_CLASSES, isTerminal, stepIndex, PROGRESS_STEPS } from "../lib/status"

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString() + " " + d.toLocaleTimeString()
}

function ProgressTrack({ status }: { status: Order["status"] }) {
  const current = stepIndex(status)

  return (
    <div className="flex items-center gap-1">
      {PROGRESS_STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < current
                ? "bg-green-500 text-white"
                : i === current
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-300"
            }`}
          >
            {i < current ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          <span
            className={`text-[10px] hidden sm:inline ${
              i <= current ? "text-gray-700" : "text-gray-300"
            }`}
          >
            {STATUS_LABEL[s]}
          </span>
          {i < PROGRESS_STEPS.length - 1 && (
            <div className={`w-4 sm:w-6 h-0.5 ${i < current ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function SkeletonMetric() {
  return (
    <div className="bg-gray-100 animate-pulse rounded-lg p-3">
      <div className="h-3 w-12 bg-gray-200 rounded mb-2" />
      <div className="h-5 w-20 bg-gray-200 rounded" />
    </div>
  )
}

function LivePulse() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-400">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      Live &mdash; polling
    </span>
  )
}

export default function OrderStatusCard({
  orderId,
  pollIntervalMs = 5000,
  onPaySuccess,
}: {
  orderId: string
  pollIntervalMs?: number
  onPaySuccess?: () => void
}) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchOrder(orderId)
      setOrder(data)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!order) return
    if (isTerminal(order.status)) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(load, pollIntervalMs)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load, pollIntervalMs, order?.status])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-gray-100 animate-pulse rounded h-4 w-40" />
          <div className="bg-gray-100 animate-pulse rounded h-5 w-14" />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
        </div>
        <div className="bg-gray-100 animate-pulse rounded h-3 w-32 mb-2" />
        <div className="bg-gray-100 animate-pulse rounded h-3 w-24" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        Order not found.
        <a href="/orders" className="ml-2 underline hover:no-underline">
          &larr; Back to orders
        </a>
      </div>
    )
  }

  const fees = calcFee(order.amount)
  const netPayout = calcNet(order.amount)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-mono text-gray-900">
            Order #{order.id.slice(0, 4)}&hellip;{order.id.slice(-4)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {order.customerId} &middot; {order.paymentMethod}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {offline && (
            <span className="text-[10px] text-red-500 font-medium">Offline</span>
          )}
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_CLASSES[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 my-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Amount</p>
          <p className="text-base font-mono font-medium text-gray-900">
            {formatAmount(order.amount)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Fee 3%</p>
          <p className="text-base font-mono font-medium text-gray-900">
            {formatAmount(fees)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Payout</p>
          <p className="text-base font-mono font-medium text-gray-900">
            {formatAmount(netPayout)}
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500 space-y-1 mb-4">
        <p>
          Customer: <span className="text-gray-700">{order.customerId}</span>
        </p>
        <p>
          Method: <span className="text-gray-700">{order.paymentMethod}</span>
        </p>
        <p>
          Version: <span className="font-mono text-gray-700">v{order.version}</span>
        </p>
        <p>
          Created: <span className="font-mono text-gray-700">{new Date(order.createdAt).toLocaleString()}</span>
        </p>
        <p>
          Updated: <span className="font-mono text-gray-700">{formatTime(order.updatedAt)}</span>
        </p>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500">Progress</p>
          {!isTerminal(order.status) && <LivePulse />}
        </div>
        <ProgressTrack status={order.status} />
      </div>

      {(order.status === "PENDING" || order.status === "PROCESSING") && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <button
            onClick={async () => {
              setPayLoading(true)
              setPayError(null)
              try {
                const key = crypto.randomUUID()
                await payOrder(order.id, order.amount, key)
                await load()
                onPaySuccess?.()
              } catch (err: unknown) {
                const apiErr = err as { error?: string }
                setPayError(apiErr.error || "Payment failed")
              } finally {
                setPayLoading(false)
              }
            }}
            disabled={payLoading}
            className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {payLoading ? "Processing..." : `Pay ${formatAmount(order.amount)}`}
          </button>
          {payError && <p className="mt-2 text-xs text-red-600">{payError}</p>}
        </div>
      )}
    </div>
  )
}
