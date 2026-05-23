"use client";

import { useState, useEffect } from "react";
import { getRecentOrders } from "../lib/api";

export default function RecentOrdersList() {
  const [orders, setOrders] = useState(getRecentOrders());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handler = () => setOrders(getRecentOrders());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  if (!mounted) return null;

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Recent Orders</h2>
        <p className="text-sm text-gray-500">No orders yet. Create one above.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h2>
      <div className="space-y-2">
        {orders.map((order) => (
          <a
            key={order.id}
            href={`/orders/${order.id}`}
            className="block p-3 border border-gray-100 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-gray-700">
                {order.id.slice(0, 12)}...
              </span>
              <span className="text-sm font-medium text-gray-900">
                ${order.amount}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-500">{order.customerId}</span>
              <span className="text-xs text-gray-400">
                {new Date(order.createdAt).toLocaleString()}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
