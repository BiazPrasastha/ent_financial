"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchOrders, type Order } from "../../lib/api"
import { formatAmount } from "../../lib/decimal"
import { STATUS_LABEL, STATUS_CLASSES } from "../../lib/status"

type FilterStatus = "ALL" | "PENDING" | "PROCESSING" | "PAID" | "SETTLED"

const FILTERS: FilterStatus[] = ["ALL", "PENDING", "PROCESSING", "PAID", "SETTLED"]

function SummaryCard({ orders }: { orders: Order[] }) {
  const counts: Record<FilterStatus, number> = { ALL: orders.length, PENDING: 0, PROCESSING: 0, PAID: 0, SETTLED: 0 }
  for (const s of FILTERS) {
    if (s !== "ALL") counts[s] = orders.filter((o) => o.status === s).length
  }

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {FILTERS.map((s) => (
        <div
          key={s}
          className="bg-white border border-gray-200 rounded-xl p-4 text-center"
        >
          <p className="text-2xl font-semibold text-gray-900">{counts[s]}</p>
          <p className="text-[11px] text-gray-500 mt-1">{s === "ALL" ? "Total" : STATUS_LABEL[s]}</p>
        </div>
      ))}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="bg-gray-100 animate-pulse rounded h-4 w-20" />
      <div className="bg-gray-100 animate-pulse rounded h-4 w-16 hidden sm:block" />
      <div className="bg-gray-100 animate-pulse rounded h-4 w-16 hidden sm:block" />
      <div className="bg-gray-100 animate-pulse rounded h-5 w-16 ml-auto" />
    </div>
  )
}

function MobileCard({ order }: { order: Order }) {
  return (
    <a
      href={`/orders/${order.id}`}
      className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-mono text-sm text-gray-900">
            {order.id.slice(0, 8)}&hellip;
          </span>
          <p className="text-xs text-gray-500 mt-0.5">{order.customerId}</p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_CLASSES[order.status]}`}>
          {STATUS_LABEL[order.status]}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-900 font-mono">{formatAmount(order.amount)}</span>
        <span className="text-gray-400 text-xs">{new Date(order.createdAt).toLocaleDateString()}</span>
      </div>
    </a>
  )
}

const PAGE_SIZE = 25

export default function OrdersPage() {
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL")
  const [search, setSearch] = useState("")
  const [dateFilter, setDateFilter] = useState("")
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    try {
      const data = await fetchOrders()
      setAllOrders(data)
      setError(null)
    } catch (err: unknown) {
      const apiErr = err as { error?: string }
      setError(apiErr.error || "Failed to load orders.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const q = search.toLowerCase().trim()
  const filtered = (statusFilter === "ALL" ? allOrders : allOrders.filter((o) => o.status === statusFilter))
    .filter((o) => !q || o.id.toLowerCase().includes(q) || o.customerId.toLowerCase().includes(q))
    .filter((o) => !dateFilter || o.createdAt.slice(0, 10) === dateFilter)

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [statusFilter, search, dateFilter])

  return (
    <>
      <h1 className="text-base font-semibold text-gray-900 mb-6">Orders</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => { setLoading(true); load() }}
            className="text-sm font-medium text-red-800 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && <SummaryCard orders={allOrders} />}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                statusFilter === s
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {s === "ALL" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="hidden sm:inline text-gray-300">|</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          )}
        </div>
        <div className="relative w-full sm:w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by ID or customer&hellip;"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
          />
        </div>
      </div>

      {loading && allOrders.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">
            {search
              ? "No orders match your search."
              : statusFilter === "ALL"
                ? "No orders yet."
                : `No ${STATUS_LABEL[statusFilter].toLowerCase()} orders.`}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <>
          <div className="sm:hidden space-y-3">
            {paginated.map((order) => (
              <MobileCard key={order.id} order={order} />
            ))}
          </div>

          <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Order ID</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Customer</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Amount</th>
                  <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                  <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Date</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => window.location.href = `/orders/${order.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-gray-900 text-xs">
                      {order.id.slice(0, 8)}&hellip;
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {order.customerId}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {formatAmount(order.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_CLASSES[order.status]}`}>
                        {STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>
              {filtered.length === 1
                ? "1 order"
                : `${filtered.length.toLocaleString()} orders`}
              {search && ` matching "${search}"`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >
                &larr;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i).map((i) => {
                if (totalPages > 7 && i > 0 && i < totalPages - 1 && Math.abs(i - safePage) > 2) {
                  return i === (safePage < totalPages / 2 ? totalPages - 2 : 1) ? (
                    <span key={i} className="px-1">&hellip;</span>
                  ) : null
                }
                return (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                      i === safePage
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {i + 1}
                  </button>
                )
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage === totalPages - 1}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >
                &rarr;
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
