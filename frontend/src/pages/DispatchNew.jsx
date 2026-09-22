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
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [plans, setPlans] = useState([]);
  const [selectedPlans, setSelectedPlans] = useState([]);
  const [bags, setBags] = useState([]);
  const [selectedBags, setSelectedBags] = useState([]);
  const [form, setForm] = useState({ transporter: "", vehicle_lr: "", remarks: "" });

  useEffect(() => { api.get("/customers").then(setCustomers); }, []);

  useEffect(() => {
    if (!customerId) return setPlans([]);
    api.get(`/customers/${customerId}/ready-plans`).then(setPlans);
    setSelectedPlans([]); setBags([]); setSelectedBags([]);
  }, [customerId]);

  const togglePlan = async (p) => {
    let sp;
    if (selectedPlans.find((x) => x.id === p.id)) sp = selectedPlans.filter((x) => x.id !== p.id);
    else sp = [...selectedPlans, p];
    setSelectedPlans(sp);
    if (sp.length > 0) {
      const b = await api.get(`/available-bags?plan_ids=${sp.map((x) => x.id).join(",")}`);
      setBags(b);
    } else setBags([]);
    setSelectedBags([]);
  };

  const toggleBag = (b) => {
    const key = `${b.return_id}|${b.bag_no}`;
    if (selectedBags.find((x) => `${x.return_id}|${x.bag_no}` === key)) setSelectedBags(selectedBags.filter((x) => `${x.return_id}|${x.bag_no}` !== key));
    else setSelectedBags([...selectedBags, b]);
  };
  const selectAllBagsForPlan = (planId) => {
    const forPlan = bags.filter((b) => b.plan_id === planId);
    const others = selectedBags.filter((b) => b.plan_id !== planId);
    setSelectedBags([...others, ...forPlan]);
  };

  const totalPairs = selectedBags.reduce((a, b) => a + b.total, 0);
  const bagsByPlan = {};
  bags.forEach((b) => { (bagsByPlan[b.plan_id] ||= []).push(b); });

  const submit = async () => {
    if (!customerId) return toast.error("Select customer");
    if (selectedPlans.length === 0) return toast.error("Select plans");
    if (selectedBags.length === 0) return toast.error("Select bags");
    try {
      const r = await api.post("/dispatches", {
        customer_id: customerId,
        plan_ids: selectedPlans.map((p) => p.id),
        bags: selectedBags.map((b) => ({ return_id: b.return_id, bag_no: b.bag_no })),
        ...form,
      });
      toast.success(`Dispatch ${r.dispatch_no} created`);
      nav("/dispatch");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid="dispatch-new-page">
      <PageHeader title="New Dispatch" subtitle="Select customer, ready plans and bags" />

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div><Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="dsp-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Transporter</Label><Input value={form.transporter} onChange={(e) => setForm({ ...form, transporter: e.target.value })} /></div>
          <div><Label>Vehicle / LR No.</Label><Input value={form.vehicle_lr} onChange={(e) => setForm({ ...form, vehicle_lr: e.target.value })} /></div>
          <div><Label>Remarks</Label><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="font-display font-semibold mb-2">Ready Plans (Finished Stock)</div>
        {!customerId && <div className="text-slate-500 text-sm">Select a customer to view ready plans.</div>}
        {customerId && plans.length === 0 && <div className="text-slate-500 text-sm">No plans ready for this customer.</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {plans.map((p) => {
            const sel = !!selectedPlans.find((x) => x.id === p.id);
            return (
              <div key={p.id} onClick={() => togglePlan(p)} data-testid={`avail-plan-${p.plan_no}`}
                className={`p-3 border rounded cursor-pointer ${sel ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Checkbox checked={sel} /><span className="font-mono font-semibold">{p.plan_no}</span></div>
                  <div className="text-xs text-slate-500">Qty {p.qty}</div>
                </div>
                <div className="text-xs mt-1 flex flex-wrap gap-x-3">
                  <span><span className="text-slate-500">Article:</span> <span className="font-semibold">{p.article_code} — {p.article_name}</span></span>
                  <span><span className="text-slate-500">Colour:</span> <span className="font-semibold">{p.colour_name}</span></span>
                </div>
                <div className="text-xs mt-1 flex gap-x-3">
                  <span><span className="text-slate-500">Config:</span> {p.plan_config_name}</span>
                  <span><span className="text-slate-500">CO:</span> <span className="font-mono">{p.co_no}</span></span>
                  {p.customer_po && <span><span className="text-slate-500">PO:</span> <span className="font-mono">{p.customer_po}</span></span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="font-display font-semibold mb-2">Bags per Plan</div>
        {selectedPlans.length === 0 && <div className="text-slate-500 text-sm">Select plans to see available bags.</div>}
        {selectedPlans.map((p) => (
          <div key={p.id} className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-sm">Plan {p.plan_no} <span className="text-slate-500 font-normal">· {p.article_code} · {p.colour_name}</span></div>
              <Button size="sm" variant="outline" onClick={() => selectAllBagsForPlan(p.id)} data-testid={`select-all-${p.plan_no}`}>Select All Bags</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(bagsByPlan[p.id] || []).length === 0 && <div className="text-slate-500 text-xs">No available bags for this plan.</div>}
              {(bagsByPlan[p.id] || []).map((b, i) => {
                const key = `${b.return_id}|${b.bag_no}`;
                const sel = !!selectedBags.find((x) => `${x.return_id}|${x.bag_no}` === key);
                return (
                  <div key={i} onClick={() => toggleBag(b)} data-testid={`bag-card-${b.plan_no}-${b.bag_no}`}
                    className={`p-3 border rounded cursor-pointer ${sel ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Checkbox checked={sel} /><span className="font-mono">Bag {b.bag_no}</span></div>
                      <div className="font-mono font-semibold">{b.total} prs</div>
                    </div>
                    <div className="text-xs mt-1">{b.sizes.map((s) => `${s.size}:${s.qty}`).join(" · ")}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm">Selected: <span className="font-mono font-semibold">{selectedBags.length}</span> bags · <span className="font-mono font-semibold">{totalPairs}</span> pairs</div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => nav(-1)}>Cancel</Button><Button onClick={submit} data-testid="submit-dispatch">Create Dispatch</Button></div>
      </div>
    </div>
  );
}
