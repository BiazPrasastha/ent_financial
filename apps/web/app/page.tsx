import OrderForm from "../components/OrderForm";
import RecentOrdersList from "../components/RecentOrdersList";

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Financial Event Store</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create orders, process payments, and view the double-entry ledger
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <OrderForm />
        <RecentOrdersList />
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-medium text-blue-800">How it works</h3>
        <ol className="mt-2 text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Create an order — a balanced double-entry ledger entry is created</li>
          <li>Process payment — the Stripe mock confirms the charge</li>
          <li>View the audit trail — every event and ledger entry is recorded</li>
          <li>Settlement — run daily settlement to pay out sellers</li>
        </ol>
      </div>
    </main>
  );
}
