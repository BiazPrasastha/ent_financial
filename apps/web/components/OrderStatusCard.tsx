"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchOrder, OrderData } from "../lib/api";
import { CardSkeleton } from "./LoadingSkeleton";

export interface OrderStatusCardProps {
  orderId: string;
  initialData?: OrderData;
  fees?: string;
  netPayout?: string;
  pollIntervalMs?: number;
}

const TERMINAL_STATUSES = new Set(["REFUNDED", "SETTLED", "DELIVERED"]);

const STATUS_COLOURS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  SHIPPED: "bg-purple-100 text-purple-800",
  DELIVERED: "bg-teal-100 text-teal-800",
  REFUNDED: "bg-red-100 text-red-800",
  SETTLED: "bg-gray-100 text-gray-800",
};

export default function OrderStatusCard({
  orderId,
  initialData,
  fees,
  netPayout,
  pollIntervalMs = 5000,
}: OrderStatusCardProps) {
  const [data, setData] = useState<OrderData | undefined>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialData);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTerminal = data?.status && TERMINAL_STATUSES.has(data.status);

  const poll = useCallback(async () => {
    try {
      const result = await fetchOrder(orderId);
      setData(result);
      setError(null);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to fetch order status");
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!isTerminal) {
      intervalRef.current = setInterval(() => {
        poll();
      }, pollIntervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isTerminal, pollIntervalMs, poll]);

  const status = data?.status ?? "PENDING";
  const badgeClass =
    STATUS_COLOURS[status] ?? "bg-gray-100 text-gray-800";

  if (loading) {
    return <CardSkeleton />;
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md border border-gray-200">
      <div className="space-y-2">
        <div className="text-sm text-gray-500">Order #{orderId.slice(0, 8)}</div>
        <div className="text-sm text-gray-700">
          <span className="font-medium">Customer:</span> {data?.customerId}
        </div>
        <div className="text-sm text-gray-700">
          <span className="font-medium">Method:</span> {data?.paymentMethod}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Amount</span>
          <span className="font-medium text-gray-900">${data?.amount ?? "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Fees (3%)</span>
          <span className="font-medium text-gray-900">
            {fees ? `$${fees}` : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Net Payout</span>
          <span className="font-medium text-gray-900">
            {netPayout ? `$${netPayout}` : "—"}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Status</span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badgeClass}`}
          >
            {status}
          </span>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Last updated: {data ? new Date(data.updatedAt).toLocaleString() : "—"}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
