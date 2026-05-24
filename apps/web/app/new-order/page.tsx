"use client"

import { useState, FormEvent } from "react"
import { createOrder, type AmountString } from "../../lib/api"
import { calcFee, calcNet, formatAmount } from "../../lib/decimal"
import { useRouter } from "next/navigation"

export default function NewOrderPage() {
  const router = useRouter()
  const [customerId, setCustomerId] = useState("cust_001")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Card")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountValid = /^[0-9]+\.[0-9]{1,4}$/.test(amount)
  const feePreview = amountValid ? calcFee(amount) : null
  const netPreview = amountValid ? calcNet(amount) : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!amountValid) return
    setLoading(true)
    setError(null)

    try {
      const key = crypto.randomUUID()
      const res = await createOrder(customerId, paymentMethod.toLowerCase(), amount, key)
      setDone(true)
      await new Promise((r) => setTimeout(r, 600))
      router.push(`/orders/${res.orderId}`)
    } catch (err: unknown) {
      const apiErr = err as { error?: string }
      setError(apiErr.error || "Failed to create order")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="text-base font-semibold text-gray-900 mb-6">New Order</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Customer ID</label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="cust_001"
              required
              disabled={loading}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100.0000"
                required
                pattern="^[0-9]+\.[0-9]{1,4}$"
                disabled={loading}
                className={`w-full border rounded-lg pl-7 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 ${
                  amount.length > 0 && amountValid
                    ? "border-green-400"
                    : amount.length > 0 && !amountValid
                      ? "border-red-400"
                      : "border-gray-200"
                }`}
              />
            </div>
            {amount.length > 0 && !amountValid && (
              <p className="text-xs text-red-500 mt-1">Must be a decimal number e.g. 100.0000</p>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-2">Payment method</label>
            <div className="grid grid-cols-3 gap-2">
              {["Card", "Bank", "Wallet"].map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={loading}
                  onClick={() => setPaymentMethod(m)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    paymentMethod === m
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  } disabled:opacity-50`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {amountValid && amount && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Order amount</span>
                <span className="font-mono text-gray-900">{formatAmount(amount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Fee (3%)</span>
                <span className="font-mono text-gray-500">{feePreview ? formatAmount(feePreview) : ""}</span>
              </div>
              <div className="border-t border-gray-200 my-1" />
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-gray-700">Net payout</span>
                <span className="font-mono text-gray-900">{netPreview ? formatAmount(netPreview) : ""}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !amountValid || amount.length === 0}
            className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (done ? "Redirecting..." : "Creating...") : "Create Order"}
          </button>
        </form>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </>
  )
}
