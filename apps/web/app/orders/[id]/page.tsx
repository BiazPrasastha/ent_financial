import OrderStatusCard from "../../../components/OrderStatusCard";
import LedgerAuditTrail from "../../../components/LedgerAuditTrail";

interface OrderPageProps {
  params: {
    id: string;
  };
}

export default function OrderPage({ params }: OrderPageProps) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Order Details</h1>
      <OrderStatusCard orderId={params.id} />
      <LedgerAuditTrail orderId={params.id} />
    </main>
  );
}
