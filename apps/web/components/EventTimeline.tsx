"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchEvents } from "../lib/api"

const DOT_COLOURS: Record<string, string> = {
  OrderCreated: "bg-gray-500",
  PaymentProcessing: "bg-blue-500",
  PaymentConfirmed: "bg-green-500",
  FeeCalculated: "bg-amber-500",
  OrderShipped: "bg-purple-500",
  OrderDelivered: "bg-teal-500",
  SettlementProcessed: "bg-gray-700",
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString() + " " + d.toLocaleTimeString()
}

function SkeletonEvent() {
  return (
    <div className="flex gap-4 pb-6 relative">
      <div className="w-3 h-3 rounded-full bg-gray-200 shrink-0 mt-1" />
      <div className="flex-1 space-y-2">
        <div className="bg-gray-100 animate-pulse rounded h-4 w-48" />
        <div className="bg-gray-100 animate-pulse rounded h-3 w-32" />
      </div>
    </div>
  )
}

export default function EventTimeline({ orderId, refreshKey }: { orderId: string; refreshKey?: number }) {
  const [events, setEvents] = useState<Array<{
    id: string
    type: string
    version: number
    data: string
    idempotencyKey: string
    timestamp: string
  }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEvents(orderId)
      setEvents(data)
    } catch (err: unknown) {
      const apiErr = err as { error?: string }
      setError(apiErr.error || "Failed to load events")
    } finally {
      setLoading(false)
    }
  }, [orderId, refreshKey])

  useEffect(() => {
    load()
  }, [load])

  function togglePayload(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Event log</h3>
        <span className="text-xs text-gray-400">Append-only &middot; {events.length} events</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => { setLoading(true); load() }} className="text-sm font-medium text-red-800 underline hover:no-underline">Retry</button>
        </div>
      )}

      {loading && events.length === 0 && (
        <div className="relative pl-1">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonEvent key={i} />)}
        </div>
      )}

      {!loading && events.length === 0 && !error && (
        <p className="text-sm text-gray-400 text-center py-8">No events recorded yet.</p>
      )}

      {events.length > 0 && (
        <div className="relative pl-1">
          {events.map((event, i) => {
            const dotColour = DOT_COLOURS[event.type] || "bg-gray-400"
            const isLast = i === events.length - 1
            let payload: unknown
            try { payload = JSON.parse(event.data) } catch { payload = event.data }

            return (
              <div key={event.id} className="flex gap-4 pb-6 relative">
                {!isLast && <div className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-200" />}
                <div className={`w-3 h-3 rounded-full ${dotColour} shrink-0 mt-1.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{event.type}</span>
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">v{event.version}</span>
                    <span className="text-[10px] font-mono text-gray-400">{formatTime(event.timestamp)}</span>
                  </div>
                  <p className="text-[10px] font-mono text-gray-400 mt-0.5">&hellip;{event.idempotencyKey.slice(-8)}</p>
                  <div className="mt-2">
                    <button onClick={() => togglePayload(event.id)} className="text-[10px] text-gray-500 hover:text-gray-700 underline">
                      {expanded[event.id] ? "Hide payload" : "Show payload"}
                    </button>
                    {expanded[event.id] && (
                      <pre className="mt-1 bg-gray-50 rounded p-2 text-[10px] font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
