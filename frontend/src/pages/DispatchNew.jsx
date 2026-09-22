import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function DispatchNew() {
  const nav = useNavigate();
  const [orders, setOrders] = useState([]);
  const [plans, setPlans] = useState([]);
  const [bags, setBags] = useState([]);
  const [selectedBags, setSelectedBags] = useState([]);
  const [selectedPlans, setSelectedPlans] = useState([]);
  const [form, setForm] = useState({ customer_order_id: "", article_id: "", colour_id: "", plan_config_id: "", transporter: "", vehicle_lr: "", remarks: "" });

  useEffect(() => {
    api.get("/customer-orders").then(setOrders);
    api.get("/plans?status=FINISHED").then(setPlans);
  }, []);

  const availPlans = plans.filter((p) => (!form.article_id || p.article_id === form.article_id) && (!form.colour_id || p.colour_id === form.colour_id) && (!form.plan_config_id || p.plan_config_id === form.plan_config_id));

  const togglePlan = async (p) => {
    let sp;
    if (selectedPlans.find((x) => x.id === p.id)) sp = selectedPlans.filter((x) => x.id !== p.id);
    else sp = [...selectedPlans, p];
    setSelectedPlans(sp);
    if (sp.length > 0) {
      const b = await api.get(`/available-bags?plan_ids=${sp.map((x) => x.id).join(",")}`);
      setBags(b);
    } else {
      setBags([]);
    }
    setSelectedBags([]);
  };

  const toggleBag = (b) => {
    const key = `${b.return_id}|${b.bag_no}`;
    if (selectedBags.find((x) => `${x.return_id}|${x.bag_no}` === key)) {
      setSelectedBags(selectedBags.filter((x) => `${x.return_id}|${x.bag_no}` !== key));
    } else {
      setSelectedBags([...selectedBags, b]);
    }
  };

  const totalPairs = selectedBags.reduce((a, b) => a + b.total, 0);

  const submit = async () => {
    if (!form.customer_order_id) return toast.error("Select order");
    if (selectedPlans.length === 0) return toast.error("Select plans");
    if (selectedBags.length === 0) return toast.error("Select bags");
    try {
      const r = await api.post("/dispatches", {
        ...form,
        plan_ids: selectedPlans.map((p) => p.id),
        bags: selectedBags.map((b) => ({ return_id: b.return_id, bag_no: b.bag_no })),
      });
      toast.success(`Dispatch ${r.dispatch_no} created`);
      nav("/dispatch");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const firstPlan = selectedPlans[0];

  return (
    <div data-testid="dispatch-new-page">
      <PageHeader title="New Dispatch" subtitle="Select ready plans and bags" />
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>Customer Order *</Label>
            <Select value={form.customer_order_id} onValueChange={(v) => setForm({ ...form, customer_order_id: v })}>
              <SelectTrigger data-testid="dsp-order"><SelectValue placeholder="Select order" /></SelectTrigger>
              <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.co_no}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Transporter</Label><Input value={form.transporter} onChange={(e) => setForm({ ...form, transporter: e.target.value })} /></div>
          <div><Label>Vehicle / LR No.</Label><Input value={form.vehicle_lr} onChange={(e) => setForm({ ...form, vehicle_lr: e.target.value })} /></div>
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <div className="font-display font-semibold mb-2">Ready Plans (Finished Stock)</div>
        {availPlans.length === 0 && <div className="text-slate-500 text-sm">No plans ready</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {availPlans.map((p) => {
            const sel = !!selectedPlans.find((x) => x.id === p.id);
            return (
              <div key={p.id} onClick={() => togglePlan(p)} data-testid={`avail-plan-${p.plan_no}`}
                className={`p-3 border rounded cursor-pointer ${sel ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                <div className="flex items-center gap-2"><Checkbox checked={sel} /> <span className="font-mono font-semibold">{p.plan_no}</span></div>
                <div className="text-xs text-slate-500 mt-1">Qty: {p.qty} · {p.plan_config_name}</div>
              </div>
            );
          })}
        </div>
        {firstPlan && !form.article_id && (
          <div className="mt-2 text-xs text-slate-600">
            <Button size="sm" variant="outline" onClick={() => setForm({ ...form, article_id: firstPlan.article_id, colour_id: firstPlan.colour_id, plan_config_id: firstPlan.plan_config_id })}>Auto-fill from selected plan</Button>
          </div>
        )}
      </Card>

      <Card className="p-4 mb-6">
        <div className="font-display font-semibold mb-2">Available Bags (from stitching returns)</div>
        {bags.length === 0 && <div className="text-slate-500 text-sm">Select plans to see bags</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {bags.map((b, i) => {
            const key = `${b.return_id}|${b.bag_no}`;
            const sel = !!selectedBags.find((x) => `${x.return_id}|${x.bag_no}` === key);
            return (
              <div key={i} onClick={() => toggleBag(b)} data-testid={`bag-card-${b.plan_no}-${b.bag_no}`}
                className={`p-3 border rounded cursor-pointer ${sel ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Checkbox checked={sel} /><span className="font-mono">Bag {b.bag_no}</span></div>
                  <div className="font-mono font-semibold">{b.total} prs</div>
                </div>
                <div className="text-xs text-slate-500 mt-1">Plan {b.plan_no} · {b.fabricator_name}</div>
                <div className="text-xs mt-1">{b.sizes.map((s) => `${s.size}:${s.qty}`).join(" · ")}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm">Selected: <span className="font-mono font-semibold">{selectedBags.length}</span> bags · <span className="font-mono font-semibold">{totalPairs}</span> pairs</div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => nav(-1)}>Cancel</Button><Button onClick={submit} data-testid="submit-dispatch">Create Dispatch</Button></div>
      </div>
    </div>
  );
}
