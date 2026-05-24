"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchLedger, verifyLedger, type LedgerEntry } from "../lib/api"
import { formatAmount, computeRunningBalances, toInt, fromInt } from "../lib/decimal"
import { ACCOUNT_LABELS } from "../lib/status"

function formatTime(iso: string): string {
  const t = iso.slice(11, 19)
  return `${t} UTC`
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="bg-gray-100 animate-pulse rounded h-4 w-6" />
      <div className="bg-gray-100 animate-pulse rounded h-4 w-16" />
      <div className="bg-gray-100 animate-pulse rounded h-4 w-24" />
      <div className="bg-gray-100 animate-pulse rounded h-4 w-16 ml-auto" />
      <div className="bg-gray-100 animate-pulse rounded h-4 w-16" />
      <div className="bg-gray-100 animate-pulse rounded h-4 w-16" />
    </div>
  )
}

export default function LedgerAuditTrail({ orderId, refreshKey }: { orderId: string; refreshKey?: number }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [isBalanced, setIsBalanced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<{
    isBalanced: boolean
    loading: boolean
    shown: boolean
  }>({ isBalanced: false, loading: false, shown: false })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLedger(orderId)
      setEntries(data.entries)
      setIsBalanced(data.isBalanced)
    } catch (err: unknown) {
      const apiErr = err as { error?: string }
      setError(apiErr.error || "Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }, [orderId, refreshKey])

  useEffect(() => {
    load()
  }, [load])

  async function handleVerify() {
    setVerifyResult((p) => ({ ...p, loading: true, shown: true }))
    try {
      const data = await verifyLedger(orderId)
      setVerifyResult({ isBalanced: data.isBalanced, loading: false, shown: true })
    } catch {
      setVerifyResult({ isBalanced: false, loading: false, shown: true })
    }
  }

  const balanced = verifyResult.shown ? verifyResult.isBalanced : isBalanced
  const balances = computeRunningBalances(entries)
  const totalDebit = entries.reduce((s, e) => s + toInt(e.debit), 0)
  const totalCredit = entries.reduce((s, e) => s + toInt(e.credit), 0)
  const net = fromInt(totalDebit - totalCredit)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">Ledger</h3>
          {!loading && (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                balanced
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-red-100 text-red-800 border-red-200"
              }`}
            >
              {balanced ? "\u2713 Balanced" : "\u2717 Imbalanced"}
            </span>
          )}
        </div>
        <button
          onClick={handleVerify}
          disabled={verifyResult.loading}
          className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {verifyResult.loading ? "Verifying\u2026" : "Verify ledger"}
        </button>
      </div>

      {!loading && !balanced && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-4">
          Ledger imbalance detected. Contact support immediately.
        </div>
      )}

      {verifyResult.shown && (
        <div
          className={`rounded-lg p-3 mb-4 font-mono text-xs space-y-1 border ${
            verifyResult.isBalanced
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <p className="text-[10px] text-gray-400">GET /verify-ledger/{orderId.slice(0, 8)}&hellip;</p>
          <pre className="whitespace-pre-wrap">
{`{
  "orderId": "${orderId.slice(0, 8)}\u2026",
  "isBalanced": ${verifyResult.isBalanced}
}`}
          </pre>
        </div>
      )}

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

      {loading && entries.length === 0 && (
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <p className="text-sm text-gray-400 text-center py-8">No ledger entries yet.</p>
      )}

      {entries.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-[10px] text-gray-400 font-medium px-3 py-2">#</th>
                  <th className="text-left text-[10px] text-gray-400 font-medium px-3 py-2">Timestamp</th>
                  <th className="text-left text-[10px] text-gray-400 font-medium px-3 py-2">Account</th>
                  <th className="text-right text-[10px] text-gray-400 font-medium px-3 py-2">Debit</th>
                  <th className="text-right text-[10px] text-gray-400 font-medium px-3 py-2">Credit</th>
                  <th className="text-right text-[10px] text-gray-400 font-medium px-3 py-2">Running</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((e, i) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">{formatTime(e.timestamp)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono text-[10px]">
                        {ACCOUNT_LABELS[e.account] || e.account}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-green-700">
                      {e.debit ? formatAmount(e.debit) : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-700">
                      {e.credit ? formatAmount(e.credit) : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-blue-700">
                      {formatAmount(balances[i])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span>{entries.length} entries</span>
            <span className="font-mono">
              {"\u03a3"} debit {"\u2212"} {"\u03a3"} credit ={" "}
              <span className={net === "0.0000" ? "text-green-600" : "text-red-600"}>
                {formatAmount(net)}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
