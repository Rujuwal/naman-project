import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, StatusBadge, Card } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { customerOrderStatus } from "@/lib/orderStatus";

export default function CustomerOrders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    api.get("/customer-orders").then(setOrders);
    api.get("/customers").then(setCustomers);
    api.get("/plans").then(setPlans);
  }, []);

  const cName = (id) => customers.find((c) => c.id === id)?.name || "-";
  const ordersWithStatus = orders.map((order) => ({
    ...order,
    liveStatus: customerOrderStatus(order, plans.filter((plan) => plan.customer_order_id === order.id)),
  }));
  const filteredOrders = ordersWithStatus.filter((order) => {
    const haystack = `${order.co_no} ${cName(order.customer_id)} ${order.customer_po || ""}`.toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    if (customerFilter !== "ALL" && order.customer_id !== customerFilter) return false;
    if (statusFilter !== "ALL" && order.liveStatus !== statusFilter) return false;
    if (!showCompleted && statusFilter !== "COMPLETED" && order.liveStatus === "COMPLETED") return false;
    return true;
  });

  return (
    <div data-testid="customer-orders-page">
      <PageHeader title="Customer Orders" subtitle="Manage sales orders and production plans"
        actions={<Link to="/customer-orders/new"><Button data-testid="new-order-btn"><Plus size={16} className="mr-1" />New Order</Button></Link>} />
      <Card className="p-4 mb-4" data-testid="customer-order-filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div><Label>Search</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="CO no., customer or PO" data-testid="order-search" /></div>
          <div><Label>Customer</Label><Select value={customerFilter} onValueChange={setCustomerFilter}><SelectTrigger data-testid="order-customer-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All customers</SelectItem>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Status</Label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger data-testid="order-status-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All active statuses</SelectItem><SelectItem value="PENDING PLANNING">Pending Planning</SelectItem><SelectItem value="PLANNED">Planned</SelectItem><SelectItem value="IN PRODUCTION">In Production</SelectItem><SelectItem value="QC PENDING">QC Pending</SelectItem><SelectItem value="REWORK">Rework</SelectItem><SelectItem value="READY TO DISPATCH">Ready to Dispatch</SelectItem><SelectItem value="COMPLETED">Completed</SelectItem></SelectContent></Select></div>
          <label className="flex items-center gap-2 text-sm h-10"><input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} data-testid="show-completed-orders" />Show completed orders</label>
        </div>
      </Card>
      <Card>
        <table className="data-table w-full">
          <thead><tr><th>CO No.</th><th>Order Date</th><th>Customer</th><th>Items</th><th>Total Plans</th><th>Total Qty</th><th>Delivery</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {filteredOrders.length === 0 && <tr><td colSpan="9" className="text-center text-slate-500 py-8">No orders match these filters</td></tr>}
            {filteredOrders.map((o) => {
              const status = o.liveStatus;
              return <tr key={o.id} data-testid={`order-row-${o.co_no}`}>
                <td><Link to={`/customer-orders/${o.id}`} className="text-blue-600 font-mono">{o.co_no}</Link></td>
                <td className="text-sm">{new Date(o.order_date).toLocaleDateString()}</td>
                <td>{cName(o.customer_id)}</td>
                <td>{o.items?.length || 0}</td>
                <td>{o.total_plans}</td>
                <td className="font-semibold">{o.total_qty}</td>
                <td className="text-sm">{o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "-"}</td>
                <td><span className="text-xs">{o.priority}</span></td>
                <td><StatusBadge status={status} /></td>
              </tr>;
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
