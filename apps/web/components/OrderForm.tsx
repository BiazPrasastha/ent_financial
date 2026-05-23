"use client";

import { useState, FormEvent } from "react";
import { createOrder, addRecentOrder, CreateOrderResponse } from "../lib/api";
import { v4 as uuidv4 } from "uuid";

export default function OrderForm() {
  const [customerId, setCustomerId] = useState("cust_001");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [amount, setAmount] = useState("100.0000");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const idempotencyKey = `order-${uuidv4()}`;
      const res = await createOrder(customerId, paymentMethod, amount, idempotencyKey);
      addRecentOrder({
        id: res.orderId,
        customerId,
        amount: res.amount,
        createdAt: new Date().toISOString(),
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Order</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID</label>
          <input
            type="text"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.0000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            pattern="^[0-9]+\.[0-9]{1,4}$"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Creating..." : "Create Order"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md space-y-1">
          <p className="text-sm text-green-800 font-medium">Order Created!</p>
          <p className="text-xs text-green-700 font-mono break-all">
            ID: {result.orderId}
          </p>
          <p className="text-xs text-green-700">
            Amount: ${result.amount} | Fees: ${result.fees} | Net: ${result.netPayout}
          </p>
          <a
            href={`/orders/${result.orderId}`}
            className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
          >
            View Order Details →
          </a>
        </div>
      )}
    </div>
  );
}
