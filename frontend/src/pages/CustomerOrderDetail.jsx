import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card, StatusBadge } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { customerOrderStatus } from "@/lib/orderStatus";

export default function CustomerOrderDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);
  const [genCount, setGenCount] = useState({});
  const [openItem, setOpenItem] = useState(null);

  const load = () => api.get(`/customer-orders/${id}`).then(setData);
  useEffect(() => {
    load();
    api.get("/customers").then(setCustomers);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [id]);

  if (!data) return <div>Loading...</div>;
  const o = data.order;
  const orderStatus = customerOrderStatus(o, data.plans);
  const cName = (id) => customers.find((c) => c.id === id)?.name || "-";
  const aName = (id) => articles.find((a) => a.id === id)?.name || "-";
  const colName = (id) => colours.find((c) => c.id === id)?.name || "-";

  const gen = async (itemId) => {
    const c = parseInt(genCount[itemId] || 0);
    if (!c || c < 1) return toast.error("Enter number of plans");
    try {
      await api.post("/plans/generate", { order_item_id: itemId, count: c });
      toast.success(`${c} plan(s) created`);
      setOpenItem(null);
      setGenCount({});
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div data-testid="order-detail-page">
      <PageHeader title={o.co_no} subtitle={cName(o.customer_id)}
        actions={<Link to={`/dispatch/new?customer_id=${o.customer_id}&order_id=${o.id}`}><Button data-testid="dispatch-customer-order">Dispatch This Order</Button></Link>} />

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-slate-500 text-xs uppercase">Order Date</div><div>{new Date(o.order_date).toLocaleDateString()}</div></div>
          <div><div className="text-slate-500 text-xs uppercase">Delivery</div><div>{o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "-"}</div></div>
          <div><div className="text-slate-500 text-xs uppercase">Priority</div><div>{o.priority}</div></div>
          <div><div className="text-slate-500 text-xs uppercase">Status</div><div><StatusBadge status={orderStatus} /></div></div>
          <div><div className="text-slate-500 text-xs uppercase">Customer PO</div><div>{o.customer_po || "-"}</div></div>
          <div><div className="text-slate-500 text-xs uppercase">Total Plans</div><div className="font-mono font-semibold">{o.total_plans}</div></div>
          <div><div className="text-slate-500 text-xs uppercase">Total Qty</div><div className="font-mono font-semibold">{o.total_qty}</div></div>
          <div className="col-span-2 md:col-span-4"><div className="text-slate-500 text-xs uppercase">Remarks</div><div>{o.remarks || "-"}</div></div>
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <div className="font-display font-semibold mb-3">Order Items</div>
        <table className="data-table w-full">
          <thead><tr><th>Article</th><th>Configuration</th><th>Colour</th><th>Plans</th><th>Qty/Plan</th><th>Total</th><th>Generated</th><th></th></tr></thead>
          <tbody>
            {o.items.map((it) => {
              const remaining = it.num_plans - it.plans_generated;
              return (
                <tr key={it.id}>
                  <td>{aName(it.article_id)}</td>
                  <td className="text-sm text-slate-500">{it.plan_config_id.slice(0, 8)}</td>
                  <td>{colName(it.colour_id)}</td>
                  <td>{it.num_plans}</td>
                  <td className="font-mono">{it.qty_per_plan}</td>
                  <td className="font-mono font-semibold">{it.total_qty}</td>
                  <td>{it.plans_generated} / {it.num_plans}</td>
                  <td>
                    {remaining > 0 && (
                      <Dialog open={openItem === it.id} onOpenChange={(v) => setOpenItem(v ? it.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" data-testid={`gen-plans-${it.id}`}>Generate Plans</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Generate Plans</DialogTitle></DialogHeader>
                          <div className="py-3">
                            <div className="text-sm mb-2">Remaining: <span className="font-semibold">{remaining}</span> plan(s)</div>
                            <Input type="number" min="1" max={remaining} value={genCount[it.id] || ""}
                              onChange={(e) => setGenCount({ ...genCount, [it.id]: e.target.value })}
                              placeholder="Number of plans to create" data-testid="gen-count" />
                          </div>
                          <DialogFooter>
                            <Button onClick={() => gen(it.id)} data-testid="confirm-gen">Create</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <div className="font-display font-semibold mb-3">Production Plans</div>
        <table className="data-table w-full">
          <thead><tr><th>Plan No.</th><th>Article</th><th>Colour</th><th>Qty</th><th>Stage</th><th>Status</th></tr></thead>
          <tbody>
            {data.plans.length === 0 && <tr><td colSpan="6" className="text-center text-slate-500 py-4">No plans generated yet</td></tr>}
            {data.plans.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/production/${p.id}`} className="text-blue-600 font-mono">{p.plan_no}</Link></td>
                <td>{aName(p.article_id)}</td>
                <td>{colName(p.colour_id)}</td>
                <td className="font-mono">{p.qty}</td>
                <td>{p.current_stage}</td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
