import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, StatusBadge, Card } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function CustomerOrders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    api.get("/customer-orders").then(setOrders);
    api.get("/customers").then(setCustomers);
  }, []);

  const cName = (id) => customers.find((c) => c.id === id)?.name || "-";

  return (
    <div data-testid="customer-orders-page">
      <PageHeader title="Customer Orders" subtitle="Manage sales orders and production plans"
        actions={<Link to="/customer-orders/new"><Button data-testid="new-order-btn"><Plus size={16} className="mr-1" />New Order</Button></Link>} />
      <Card>
        <table className="data-table w-full">
          <thead><tr><th>CO No.</th><th>Order Date</th><th>Customer</th><th>Items</th><th>Total Plans</th><th>Total Qty</th><th>Delivery</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan="9" className="text-center text-slate-500 py-8">No orders yet</td></tr>}
            {orders.map((o) => (
              <tr key={o.id} data-testid={`order-row-${o.co_no}`}>
                <td><Link to={`/customer-orders/${o.id}`} className="text-blue-600 font-mono">{o.co_no}</Link></td>
                <td className="text-sm">{new Date(o.order_date).toLocaleDateString()}</td>
                <td>{cName(o.customer_id)}</td>
                <td>{o.items?.length || 0}</td>
                <td>{o.total_plans}</td>
                <td className="font-semibold">{o.total_qty}</td>
                <td className="text-sm">{o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "-"}</td>
                <td><span className="text-xs">{o.priority}</span></td>
                <td><StatusBadge status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
