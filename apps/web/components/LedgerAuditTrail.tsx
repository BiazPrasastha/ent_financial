"use client";

import { useState, useEffect } from "react";
import { API_URL } from "../lib/api";
import { TableSkeleton } from "./LoadingSkeleton";

interface LedgerEntry {
  id: string;
  account: string;
  debit: string | null;
  credit: string | null;
  description: string;
  timestamp: string;
}

interface LedgerResponse {
  entries: LedgerEntry[];
  runningBalance: string;
  isBalanced: boolean;
}

interface LedgerAuditTrailProps {
  orderId: string;
}

const ACCOUNT_DISPLAY_NAMES: Record<string, string> = {
  order_balance: "Order Balance",
  order_pending: "Order Pending",
  payment_received: "Payment Received",
  fees_owed: "Fees Owed",
  seller_payout: "Seller Payout",
};

function toCents(value: string): number {
  return parseInt(value.replace(".", ""), 10);
}

function fromCents(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const dollars = Math.floor(abs / 10000);
  const cents = abs % 10000;
  const centsStr = String(cents).padStart(4, "0");
  return `${sign}${String(dollars)}.${centsStr}`;
}

function computeRunningBalance(entries: LedgerEntry[]): { balance: string }[] {
  let balanceCents = 0;
  return entries.map((entry) => {
    if (entry.debit) {
      balanceCents += toCents(entry.debit);
    }
    if (entry.credit) {
      balanceCents -= toCents(entry.credit);
    }
    return { balance: fromCents(balanceCents) };
  });
}

export default function LedgerAuditTrail({ orderId }: LedgerAuditTrailProps) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLedger() {
      try {
        const res = await fetch(`${API_URL}/orders/${orderId}/ledger`, {
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to fetch ledger");
        }

        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to fetch ledger");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchLedger();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ledger Audit Trail</h2>
        <TableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ledger Audit Trail</h2>
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-xs text-red-600 underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ledger Audit Trail</h2>
        <div className="p-8 text-center border border-dashed border-gray-300 rounded-lg">
          <p className="text-sm text-gray-500">No ledger entries yet</p>
          <p className="text-xs text-gray-400 mt-1">Entries appear once the order is created</p>
        </div>
      </div>
    );
  }

  const runningBalances = computeRunningBalance(data.entries);

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Ledger Audit Trail</h2>
        {data.isBalanced ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Balanced
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Imbalanced
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50"
              >
                #
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50"
              >
                Timestamp
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50"
              >
                Account
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50"
              >
                Debit
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50"
              >
                Credit
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50"
              >
                Running Balance
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.entries.map((entry, index) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {index + 1}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {ACCOUNT_DISPLAY_NAMES[entry.account] || entry.account}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-700 font-mono">
                  {entry.debit ? `$${entry.debit}` : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-700 font-mono">
                  {entry.credit ? `$${entry.credit}` : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-700 font-mono">
                  ${runningBalances[index].balance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
