"use client"

import { useState, FormEvent, useEffect } from "react"
import { runSettlement, fetchSettlementSummary, type SettlementResult, type AmountString } from "../../lib/api"
import { formatAmount, fromInt, toInt } from "../../lib/decimal"

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function last7Days(): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

export default function SettlementPage() {
  const [date, setDate] = useState(todayStr)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SettlementResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date)

  const [historyDates] = useState(last7Days)
  const [history, setHistory] = useState<Record<string, { data: { totalPayout: AmountString; ordersSettled: number } | null; loading: boolean }>>({})
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    setHistoryLoading(true)
    let done = 0
    for (const d of historyDates) {
      setHistory((prev) => ({ ...prev, [d]: { data: null, loading: true } }))
      fetchSettlementSummary(d)
        .then((data) => {
          setHistory((prev) => ({ ...prev, [d]: { data, loading: false } }))
          done++
          if (done === historyDates.length) setHistoryLoading(false)
        })
        .catch(() => {
          setHistory((prev) => ({ ...prev, [d]: { data: null, loading: false } }))
          done++
          if (done === historyDates.length) setHistoryLoading(false)
        })
    }
  }, [historyDates])

  async function handleRun(e: FormEvent) {
    e.preventDefault()
    if (!dateValid) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const key = crypto.randomUUID()
      const data = await runSettlement(date, key)
      setResult(data)
      setHistory((prev) => ({ ...prev, [date]: { data: { totalPayout: data.totalPayout, ordersSettled: data.ordersSettled }, loading: false } }))
    } catch (err: unknown) {
      const apiErr = err as { error?: string }
      setError(apiErr.error || "Settlement failed")
    } finally {
      setRunning(false)
    }
  }

  const totalPayout = Object.values(history).reduce((sum, h) => sum + (h.data ? toInt(h.data.totalPayout) : 0), 0)

  return (
    <>
      <h1 className="text-base font-semibold text-gray-900 mb-6">Settlement</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Run settlement</h2>
          <form onSubmit={handleRun} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Settlement date</label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="YYYY-MM-DD"
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                  date.length > 0 && !dateValid ? "border-red-400" : "border-gray-200"
                }`}
              />
              {date.length > 0 && !dateValid && <p className="text-xs text-red-500 mt-1">Must be YYYY-MM-DD</p>}
            </div>
            <button
              type="submit"
              disabled={running || !dateValid}
              className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {running ? "Running..." : "Run settlement"}
            </button>
            <p className="text-xs text-gray-400 text-center">Idempotent &mdash; running twice produces the same result.</p>
          </form>
          {result && (
            <div className={`mt-4 rounded-lg p-4 border ${result.ordersSettled > 0 ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
              {result.ordersSettled > 0 ? (
                <>
                  <p className="text-sm font-semibold text-green-800 mb-2">Settlement complete</p>
                  <div className="space-y-1 text-xs text-green-700">
                    <p>Settled: {result.ordersSettled}</p>
                    <p>Skipped: {result.ordersSkipped}</p>
                    <p>Payout: {formatAmount(result.totalPayout)}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-yellow-800">No new orders to settle. {result.ordersSkipped} already settled.</p>
              )}
            </div>
          )}
          {error && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-gray-900">History</h2>
            {historyLoading && <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />}
          </div>
          <div className="divide-y divide-gray-100">
            {historyDates.map((d) => {
              const h = history[d]
              return (
                <div key={d} className="flex items-center justify-between px-0 py-3">
                  <span className="text-sm text-gray-900 font-mono">{d}</span>
                  {h?.loading ? (
                    <div className="bg-gray-100 animate-pulse rounded h-4 w-20" />
                  ) : h?.data ? (
                    <>
                      <span className="text-xs text-gray-500">{h.data.ordersSettled} settled</span>
                      <span className="text-sm font-mono text-gray-900">{formatAmount(h.data.totalPayout)}</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">&mdash;</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500 font-medium">Total</span>
            <span className="font-mono text-gray-900">{formatAmount(fromInt(totalPayout))}</span>
          </div>
        </div>
      </div>
    </>
  )
}
