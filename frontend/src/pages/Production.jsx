import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card, StatusBadge } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "ALL", label: "All Plans" },
  { key: "PLANNED", label: "Planned" },
  { key: "CUTTING", label: "Cutting" },
  { key: "PRINTING", label: "Printing" },
  { key: "STITCHING_OUT", label: "Stitching Out" },
  { key: "STITCHING_RETURN", label: "Stitching Return" },
  { key: "QC", label: "QC" },
  { key: "REWORK", label: "Rework" },
  { key: "FINISHED", label: "Finished Stock" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default function Production() {
  const [tab, setTab] = useState("ALL");
  const [plans, setPlans] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planningItem, setPlanningItem] = useState(null);

  const loadPlans = () => {
    const q = tab === "ALL" ? "" : `?status=${tab}`;
    return api.get(`/plans${q}`).then(setPlans);
  };

  const loadPendingOrders = () => api.get("/customer-orders").then(setOrders);

  useEffect(() => {
    loadPlans();
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
    api.get("/plan-configs").then(setConfigs);
    loadPendingOrders();
  }, [tab]);

  const aName = (id) => articles.find((a) => a.id === id)?.code || "-";
  const colName = (id) => colours.find((c) => c.id === id)?.name || "-";
  const configName = (id) => configs.find((c) => c.id === id)?.name || "-";
  const pendingItems = orders.flatMap((order) => (order.items || [])
    .filter((item) => item.num_plans > item.plans_generated)
    .map((item) => ({ ...item, co_no: order.co_no, customer_po: order.customer_po })));

  const createPlan = async (item) => {
    setPlanningItem(item.id);
    try {
      const created = await api.post("/plans/generate", { order_item_id: item.id, count: 1 });
      toast.success(`Plan ${created[0]?.plan_no || ""} created`);
      await Promise.all([loadPlans(), loadPendingOrders()]);
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Could not create the plan");
    } finally {
      setPlanningItem(null);
    }
  };

  const actionLabel = (s) => ({
    PLANNED: "Start Cutting", CUTTING: "Issue to Printing", PRINTING: "Issue to Fabricator",
    STITCHING_OUT: "Receive Stitching", QC: "Perform QC", REWORK: "Resolve QC", HOLD: "Resolve QC",
    FINISHED: "View", DISPATCHED: "View", CANCELLED: "View",
  }[s] || "View");

  return (
    <div data-testid="production-page">
      <PageHeader title="Production" subtitle="All production plans and stages"
        actions={
          <Dialog open={planningOpen} onOpenChange={setPlanningOpen}>
            <DialogTrigger asChild><Button data-testid="btn-new-planning"><Plus size={16} className="mr-1" />New Planning</Button></DialogTrigger>
            <DialogContent aria-describedby={undefined} className="max-w-4xl">
              <DialogHeader><DialogTitle>Pending Customer Orders for Planning</DialogTitle></DialogHeader>
              <div className="max-h-[60vh] overflow-auto">
                <p className="text-sm text-slate-500 mb-3">Choose an unplanned order item to create its next production plan.</p>
                <table className="data-table w-full" data-testid="pending-planning-table">
                  <thead><tr><th>CO No.</th><th>Article</th><th>Colour</th><th>Configuration</th><th>Qty / Plan</th><th>Pending Plans</th><th></th></tr></thead>
                  <tbody>
                    {pendingItems.length === 0 && <tr><td colSpan="7" className="text-center text-slate-500 py-6">No customer-order items are pending planning.</td></tr>}
                    {pendingItems.map((item) => (
                      <tr key={item.id} data-testid={`pending-plan-${item.id}`}>
                        <td className="font-mono">{item.co_no}</td>
                        <td>{aName(item.article_id)}</td>
                        <td>{colName(item.colour_id)}</td>
                        <td>{configName(item.plan_config_id)}</td>
                        <td className="font-mono">{item.qty_per_plan}</td>
                        <td className="font-mono font-semibold">{item.num_plans - item.plans_generated}</td>
                        <td><Button size="sm" onClick={() => createPlan(item)} disabled={planningItem === item.id} data-testid={`plan-item-${item.id}`}>{planningItem === item.id ? "Planning…" : "Plan"}</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DialogContent>
          </Dialog>
        } />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Card className="overflow-x-auto">
        <table className="data-table w-full">
          <thead><tr><th>Plan No.</th><th>Plan Date</th><th>CO</th><th>Article</th><th>Colour</th><th>Config</th><th>Qty</th><th>QC Date</th><th>Dispatch Date</th><th>Stage</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {plans.length === 0 && <tr><td colSpan="12" className="text-center text-slate-500 py-8">No plans</td></tr>}
            {plans.map((p) => (
              <tr key={p.id} data-testid={`plan-row-${p.plan_no}`}>
                <td><Link to={`/production/${p.id}`} className="text-blue-600 font-mono">{p.plan_no}</Link></td>
                <td className="text-sm">{new Date(p.plan_date).toLocaleDateString()}</td>
                <td className="font-mono text-xs">{p.co_no}</td>
                <td>{aName(p.article_id)}</td>
                <td>{colName(p.colour_id)}</td>
                <td className="text-sm">{p.plan_config_name}</td>
                <td className="font-mono font-semibold">{p.qty}</td>
                <td className="text-xs whitespace-nowrap" data-testid={`plan-qc-date-${p.id}`}>{p.qc_date ? new Date(p.qc_date).toLocaleDateString() : "-"}</td>
                <td className="text-xs whitespace-nowrap" data-testid={`plan-dispatch-date-${p.id}`}>{p.dispatch_date ? new Date(p.dispatch_date).toLocaleDateString() : "-"}</td>
                <td>{p.current_stage}</td>
                <td><StatusBadge status={p.status} /></td>
                <td><Link to={`/production/${p.id}`} className="text-blue-600 text-sm font-semibold">{actionLabel(p.status)} →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
