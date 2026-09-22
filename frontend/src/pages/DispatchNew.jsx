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
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    let active = true;
    setSummary(null); setSummaryError("");
    if (!selectedBags.length) return;
    const timer = setTimeout(() => {
      api.post("/dispatches/preview", {
        customer_id: customerId, plan_ids: selectedPlans.map((p) => p.id),
        bags: selectedBags.map((b) => ({ return_id: b.return_id, bag_no: b.bag_no })),
      }).then((data) => { if (active) setSummary(data); })
        .catch((e) => { if (active) setSummaryError(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Unable to calculate packing totals"); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [customerId, selectedPlans, selectedBags]);

  useEffect(() => { api.get("/customers").then(setCustomers); }, []);

  useEffect(() => {
    if (!customerId) return setPlans([]);
    api.get(`/customers/${customerId}/ready-plans`).then(setPlans);
    setSelectedPlans([]); setBags([]); setSelectedBags([]);
  }, [customerId]);

  const togglePlan = (p) => setSelectedPlans((prev) => prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]);

  useEffect(() => {
    let active = true;
    setBags([]); setSelectedBags([]);
    if (!selectedPlans.length) return;
    api.get(`/available-bags?plan_ids=${selectedPlans.map((x) => x.id).join(",")}`).then((data) => {
      if (active) setBags(data);
    }).catch(() => { if (active) toast.error("Unable to load packing rows"); });
    return () => { active = false; };
  }, [selectedPlans]);

  const toggleBag = (b) => {
    const key = `${b.return_id}|${b.bag_no}`;
    setSelectedBags((prev) => prev.some((x) => `${x.return_id}|${x.bag_no}` === key) ? prev.filter((x) => `${x.return_id}|${x.bag_no}` !== key) : [...prev, b]);
  };
  const selectAllBagsForPlan = (planId) => setSelectedBags((prev) => [...prev.filter((b) => b.plan_id !== planId), ...bags.filter((b) => b.plan_id === planId)]);

  const bagsByPlan = {};
  bags.forEach((b) => { (bagsByPlan[b.plan_id] ||= []).push(b); });

  const submit = async () => {
    if (!customerId) return toast.error("Select customer");
    if (selectedPlans.length === 0) return toast.error("Select plans");
    if (selectedBags.length === 0) return toast.error("Select packing rows");
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
      <PageHeader title="New Dispatch" subtitle="Select customer, ready plans and original packing rows" />

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
        <div className="font-display font-semibold mb-2">Packing Rows per Plan</div>
        {selectedPlans.length === 0 && <div className="text-slate-500 text-sm">Select plans to see the original packing matrix.</div>}
        {selectedPlans.map((p) => (
          <div key={p.id} className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-sm">Plan {p.plan_no} <span className="text-slate-500 font-normal">· {p.article_code} · {p.colour_name}</span></div>
              <Button size="sm" variant="outline" onClick={() => selectAllBagsForPlan(p.id)} data-testid={`select-all-${p.plan_no}`}>Select All Rows</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(bagsByPlan[p.id] || []).length === 0 && <div className="text-slate-500 text-xs">No available packing rows for this plan.</div>}
              {(bagsByPlan[p.id] || []).map((b, i) => {
                const key = `${b.return_id}|${b.bag_no}`;
                const sel = !!selectedBags.find((x) => `${x.return_id}|${x.bag_no}` === key);
                return (
                  <div key={i} onClick={() => toggleBag(b)} data-testid={`packing-card-${b.plan_no}-${b.serial_no}`}
                    className={`p-3 border rounded cursor-pointer ${sel ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Checkbox checked={sel} data-testid={`select-packing-${b.return_id}-${b.serial_no}`} /><span className="font-mono" data-testid={`packing-label-${b.return_id}-${b.serial_no}`}>S. No. {b.serial_no}</span></div>
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

      {summaryError && <div role="alert" className="text-red-700 text-sm mb-3" data-testid="dispatch-packing-error">{summaryError}</div>}
      <div className="flex items-center justify-between">
        <div className="text-sm flex gap-5 flex-wrap">
          <span data-testid="dispatch-selected-rows">Packing rows: <strong>{selectedBags.length}</strong></span>
          <span data-testid="dispatch-total-bags">TOTAL BAGS: <strong>{summary?.total_bags ?? (selectedBags.length ? "—" : 0)}</strong></span>
          <span data-testid="dispatch-total-pairs">TOTAL PAIRS: <strong>{summary?.total_pairs ?? (selectedBags.length ? "—" : 0)}</strong></span>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => nav(-1)} data-testid="cancel-new-dispatch">Cancel</Button><Button onClick={submit} disabled={!summary || !!summaryError} data-testid="submit-dispatch">Create Dispatch</Button></div>
      </div>
    </div>
  );
}
