import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card, StatusBadge } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, Printer, XCircle } from "lucide-react";

export default function PlanDetail() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [fabricators, setFabricators] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);
  const [shortages, setShortages] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [closeRejectedOpen, setCloseRejectedOpen] = useState(false);
  const [closeRejectedRemarks, setCloseRejectedRemarks] = useState("");

  // fabricator issue form
  const [fab, setFab] = useState({ fabricator_id: "", due_date: "", instructions: "" });
  const [fabOpen, setFabOpen] = useState(false);

  // stitching return
  const [retOpen, setRetOpen] = useState(false);
  const [bags, setBags] = useState([]);
  const [sizeResults, setSizeResults] = useState([]);
  const [retRemarks, setRetRemarks] = useState("");
  const [packing, setPacking] = useState(null);
  const [packingError, setPackingError] = useState("");

  useEffect(() => {
    if (!retOpen) return;
    let active = true;
    setPacking(null); setPackingError("");
    const timer = setTimeout(() => {
      api.post(`/plans/${id}/packing-preview`, { bags }).then((data) => {
        if (active) { setPacking(data); setPackingError(data.packing_error || ""); }
      }).catch((e) => {
        if (active) setPackingError(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Enter non-negative whole pairs");
      });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [bags, id, retOpen]);

  // qc
  const [qcOpen, setQcOpen] = useState(false);
  const [qc, setQc] = useState({ size_results: [], defects: [], remarks: "" });

  const load = () => api.get(`/plans/${id}`).then((p) => {
    setPlan(p);
    // init size grids from sizes_snapshot
    setSizeResults(p.sizes_snapshot.map((s) => ({ size: s.size, good: 0, rework: 0, reject: 0 })));
    const qcSizes = p.qc_expected_by_size
      ? p.sizes_snapshot.filter((s) => p.qc_expected_by_size[s.size] > 0)
      : p.sizes_snapshot;
    setQc({
      size_results: qcSizes.map((s) => ({ size: s.size, passed: 0, rework: 0, hold: 0 })),
      defects: [], remarks: "",
    });
  });

  useEffect(() => {
    load();
    api.get("/fabricators").then(setFabricators);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [id]);

  if (!plan) return <div>Loading...</div>;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);
  const calculatedSizeResults = plan.sizes_snapshot.map((s) => {
    const entered = sizeResults.find((result) => result.size === s.size) || {};
    const returned = packing?.size_totals?.[s.size] || 0;
    const rework = entered.rework || 0;
    const reject = entered.reject || 0;
    return { size: s.size, returned, good: returned - rework - reject, rework, reject };
  });
  const returnAllocationError = calculatedSizeResults.find((result) => result.good < 0);
  const qcReceivedQty = (size) => {
    if (plan.qc_expected_by_size) return plan.qc_expected_by_size[size] || 0;
    const ret = plan.returns?.[plan.returns.length - 1];
    const result = ret?.size_results?.find((entry) => entry.size === size);
    return result ? (result.good || 0) + (result.rework || 0) : 0;
  };
  const qcEntryError = qc.size_results.find((result) =>
    result.passed + result.rework + result.hold !== qcReceivedQty(result.size));

  const startCutting = async () => {
    setShortages(null);
    try {
      const r = await api.post(`/plans/${id}/start-cutting`);
      if (r.ok === false) {
        setShortages(r.shortages);
        toast.error("Material shortage - cannot start cutting");
      } else {
        toast.success("Cutting started");
        load();
      }
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check entered values and try again"); }
  };

  const issuePrinting = async () => {
    try { await api.post(`/plans/${id}/issue-to-printing`); toast.success("Issued to Printing"); load(); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check entered values and try again"); }
  };

  const issueFabricator = async () => {
    if (!fab.fabricator_id) return toast.error("Select fabricator");
    try {
      await api.post(`/plans/${id}/issue-to-fabricator`, { ...fab, due_date: fab.due_date || null });
      toast.success("Issued to Fabricator");
      setFabOpen(false);
      load();
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check entered values and try again"); }
  };

  const addBag = () => setBags((prev) => [...prev, { bag_no: String(prev.length + 1), sizes: plan.sizes_snapshot.map((s) => ({ size: s.size, qty: 0 })), remarks: "" }]);
  const rmBag = (i) => setBags((prev) => prev.filter((_, idx) => idx !== i).map((b, n) => ({ ...b, bag_no: String(n + 1) })));
  const updBag = (i, k, v) => setBags((prev) => prev.map((b, idx) => idx === i ? { ...b, [k]: v } : b));
  const updBagSize = (i, size, v) => setBags((prev) => prev.map((b, idx) => idx === i ? { ...b, sizes: b.sizes.map((s) => s.size === size ? { ...s, qty: Number(v) } : s) } : b));

  // The packing matrix is the source of the returned quantity. Only exception
  // quantities are entered; good pairs are calculated as the remaining balance.
  const updReturnException = (size, k, v) => setSizeResults((prev) => prev.map((s) => s.size === size ? { ...s, [k]: Number(v) } : s));

  const submitReturn = async () => {
    if (bags.length === 0) return toast.error("Add at least one packing row");
    if (!packing || packingError) return toast.error(packingError || "Wait for packing totals");
    if (returnAllocationError) return toast.error(`Size ${returnAllocationError.size}: Rework + Reject cannot exceed the packing quantity`);
    try {
      await api.post(`/plans/${id}/receive-stitching`, {
        bags,
        size_results: calculatedSizeResults.map(({ size, good, rework, reject }) => ({ size, good, rework, reject })),
        remarks: retRemarks,
      });
      toast.success("Return recorded");
      setRetOpen(false); setBags([]); load();
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check entered values and try again"); }
  };

  const updQC = (size, k, v) => setQc((prev) => ({ ...prev, size_results: prev.size_results.map((s) => s.size === size ? { ...s, [k]: Number(v) } : s) }));

  const submitQC = async () => {
    if (qcEntryError) return toast.error(`Size ${qcEntryError.size}: Pass + Rework + Hold must equal received quantity (${qcReceivedQty(qcEntryError.size)})`);
    try {
      await api.post(`/plans/${id}/qc`, qc);
      toast.success("QC saved");
      setQcOpen(false); load();
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check entered values and try again"); }
  };

  const reworkReturn = async () => {
    try { await api.post(`/plans/${id}/rework-return`, { remarks: "" }); toast.success("Returned to QC for re-inspection"); load(); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check entered values and try again"); }
  };

  const closeRejected = async () => {
    try {
      const result = await api.post(`/plans/${id}/close-rejected`, { remarks: closeRejectedRemarks || null });
      toast.success(`${result.rejected_qty} pair(s) closed as rejected. Passed stock is ready for dispatch.`);
      setCloseRejectedOpen(false); setCloseRejectedRemarks(""); load();
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Could not close rejected pairs"); }
  };

  const cancelPlan = async () => {
    if (!cancelReason.trim()) return toast.error("Enter reason");
    try {
      await api.post(`/plans/${id}/cancel`, { reason: cancelReason });
      toast.success("Plan cancelled");
      setCancelOpen(false); setCancelReason("");
      load();
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check entered values and try again"); }
  };

  const qcResolutionActions = () => (
    <>
      <Button onClick={reworkReturn} data-testid="btn-rework-return">Reinspect QC</Button>
      <Dialog open={closeRejectedOpen} onOpenChange={setCloseRejectedOpen}>
        <DialogTrigger asChild><Button variant="outline" data-testid="btn-close-rejected">Reject Outstanding & Dispatch</Button></DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Close outstanding QC pairs as rejected?</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">The QC-passed pairs remain in finished stock and can be dispatched. Outstanding rework or held pairs will be recorded as rejected and will not be dispatched.</p>
            <Textarea placeholder="Reason for rejection (optional)" value={closeRejectedRemarks} onChange={(e) => setCloseRejectedRemarks(e.target.value)} data-testid="close-rejected-remarks" />
          </div>
          <DialogFooter><Button onClick={closeRejected} data-testid="confirm-close-rejected">Confirm Rejection</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  const actionButton = () => {
    switch (plan.status) {
      case "PLANNED":
        return <Button onClick={startCutting} data-testid="btn-start-cutting">Start Cutting</Button>;
      case "CUTTING":
        return <>
          <a href={`/print/cutting/${plan.id}`} target="_blank" rel="noreferrer"><Button variant="outline" data-testid="btn-print-cutting"><Printer size={14} className="mr-1" />Cutting Slip</Button></a>
          <Button onClick={issuePrinting} data-testid="btn-issue-printing">Issue to Printing</Button>
        </>;
      case "PRINTING":
        return <>
          <a href={`/print/printing/${plan.id}`} target="_blank" rel="noreferrer"><Button variant="outline"><Printer size={14} className="mr-1" />Printing Slip</Button></a>
          <Dialog open={fabOpen} onOpenChange={setFabOpen}>
            <DialogTrigger asChild><Button data-testid="btn-issue-fabricator">Issue to Fabricator</Button></DialogTrigger>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader><DialogTitle>Issue to Fabricator</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div><Label>Fabricator *</Label>
                  <Select value={fab.fabricator_id} onValueChange={(v) => setFab({ ...fab, fabricator_id: v })}>
                    <SelectTrigger data-testid="fab-select"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{fabricators.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Due Date</Label><Input type="date" value={fab.due_date} onChange={(e) => setFab({ ...fab, due_date: e.target.value })} /></div>
                <div><Label>Instructions</Label><Textarea rows={2} value={fab.instructions} onChange={(e) => setFab({ ...fab, instructions: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={issueFabricator} data-testid="confirm-fab">Issue</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>;
      case "STITCHING_OUT":
        return <>
          <a href={`/print/stitching/${plan.id}`} target="_blank" rel="noreferrer"><Button variant="outline"><Printer size={14} className="mr-1" />Stitching Card</Button></a>
          <Dialog open={retOpen} onOpenChange={setRetOpen}>
            <DialogTrigger asChild><Button data-testid="btn-receive-stitching">Receive Stitching</Button></DialogTrigger>
            <DialogContent aria-describedby={undefined} className="max-w-4xl">
              <DialogHeader><DialogTitle>Stitching Return - {plan.plan_no}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2 max-h-[70vh] overflow-auto">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Packing Matrix</div>
                    <Button size="sm" variant="outline" onClick={addBag} data-testid="add-packing-row"><Plus size={14} className="mr-1" />Add Packing Row</Button>
                  </div>
                  <p className="text-xs text-slate-500 mb-2" data-testid="return-packing-help">S. No. identifies a packing row, not a physical bag. Bag totals use each size's Pairs Per Bag rule.</p>
                  <table className="data-table w-full" data-testid="return-packing-table">
                    <thead><tr><th>S. No.</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>Size {s.size}</th>)}<th>Total</th><th>Remarks</th><th></th></tr></thead>
                    <tbody>
                      {bags.map((b, i) => (
                        <tr key={i} data-testid={`return-packing-row-${i + 1}`}>
                          <td className="font-mono" data-testid={`packing-serial-${i + 1}`}>{i + 1}</td>
                          {b.sizes.map((s) => (
                            <td key={s.size}><Input type="number" min="0" step="1" value={s.qty} onChange={(e) => updBagSize(i, s.size, e.target.value)} className="w-16" data-testid={`packing-${i}-size-${s.size}`} /></td>
                          ))}
                          <td className="font-mono font-semibold" data-testid={`packing-row-total-${i}`}>{packing?.row_totals[i] ?? "—"}</td>
                          <td><Input value={b.remarks} onChange={(e) => updBag(i, "remarks", e.target.value)} className="w-32" data-testid={`packing-row-remarks-${i}`} /></td>
                          <td><Button variant="ghost" size="sm" onClick={() => rmBag(i)} data-testid={`remove-packing-row-${i}`}><Trash2 size={14} /></Button></td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-semibold">
                        <td>TOTAL</td>
                        {plan.sizes_snapshot.map((s) => <td key={s.size} className="font-mono" data-testid={`packing-size-total-${s.size}`}>{packing?.size_totals[s.size] ?? "—"}</td>)}
                        <td className="font-mono">{packing?.total_pairs ?? "—"}</td>
                        <td colSpan="2"></td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-6 mt-3 font-semibold">
                    <div data-testid="return-total-bags">TOTAL BAGS: {packing?.total_bags ?? "—"}</div>
                    <div data-testid="return-total-pairs">TOTAL PAIRS: {packing?.total_pairs ?? "—"}</div>
                  </div>
                  {packingError && <div role="alert" className="text-red-700 text-sm mt-2" data-testid="return-packing-error">{packingError}</div>}
                  {packing && !packingError && <div className="text-xs text-slate-500 mt-2" data-testid="return-packing-breakdown">{Object.entries(packing.size_totals).map(([size, qty]) => `Size ${size}: ${qty} ÷ ${packing.packing_rule_snapshot[size]} = ${packing.bags_by_size[size]} bags`).join(" · ")}{Object.keys(packing.partial_pairs_by_size).length > 0 && " (includes partly filled bags, counted separately by size)"}</div>}
                </div>

                <div>
                  <div className="font-semibold mb-2">Size-wise Good / Rework / Reject</div>
                  <p className="text-xs text-slate-500 mb-2">Returned quantity comes from the packing matrix. Enter only Rework or Reject; Good is calculated automatically.</p>
                  <table className="data-table w-full">
                    <thead><tr><th>Size</th><th>Plan Qty</th><th>Returned</th><th>Good (calculated)</th><th>Rework</th><th>Reject</th></tr></thead>
                    <tbody>
                      {calculatedSizeResults.map((sr) => {
                        const planQty = plan.sizes_snapshot.find((s) => s.size === sr.size)?.pairs || 0;
                        return (
                          <tr key={sr.size}>
                            <td className="font-mono">{sr.size}</td>
                            <td>{planQty}</td>
                            <td className="font-mono">{sr.returned}</td>
                            <td className={`font-mono font-semibold ${sr.good < 0 ? "text-red-700" : ""}`} data-testid={`sr-${sr.size}-good`}>{Math.max(0, sr.good)}</td>
                            <td><Input type="number" min="0" max={sr.returned} value={sr.rework} onChange={(e) => updReturnException(sr.size, "rework", e.target.value)} className="w-20" data-testid={`sr-${sr.size}-rework`} /></td>
                            <td><Input type="number" min="0" max={sr.returned} value={sr.reject} onChange={(e) => updReturnException(sr.size, "reject", e.target.value)} className="w-20" data-testid={`sr-${sr.size}-reject`} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {returnAllocationError && <div role="alert" className="text-red-700 text-sm mt-2">Size {returnAllocationError.size}: Rework + Reject cannot exceed Returned.</div>}
                </div>
                <Textarea placeholder="Remarks" value={retRemarks} onChange={(e) => setRetRemarks(e.target.value)} />
              </div>
              <DialogFooter><Button onClick={submitReturn} disabled={!packing || !!packingError || !!returnAllocationError || !bags.length} data-testid="confirm-return">Save Return</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>;
      case "QC":
        return <>
          <a href={`/print/qc-blank/${plan.id}`} target="_blank" rel="noreferrer"><Button variant="outline" data-testid="btn-print-qc-blank"><Printer size={14} className="mr-1" />QC Slip (blank)</Button></a>
          <Dialog open={qcOpen} onOpenChange={setQcOpen}>
          <DialogTrigger asChild><Button data-testid="btn-qc">Perform QC</Button></DialogTrigger>
          <DialogContent aria-describedby={undefined} className="max-w-3xl">
            <DialogHeader><DialogTitle>QC - {plan.plan_no}</DialogTitle></DialogHeader>
            <div className="py-2 max-h-[70vh] overflow-auto space-y-3">
              <div className="flex gap-6 text-sm"><span data-testid="qc-form-number">Plan No.: {plan.plan_no}</span><span data-testid="qc-form-date">Date: {plan.qc_date ? new Date(plan.qc_date).toLocaleDateString() : "-"}</span></div>
              <table className="data-table w-full">
                <thead><tr><th>Size</th><th>Returned</th><th>Pass</th><th>Rework</th><th>Hold</th></tr></thead>
                <tbody>
                  {qc.size_results.map((sr) => {
                    const returned = qcReceivedQty(sr.size);
                    return (
                      <tr key={sr.size}>
                        <td className="font-mono">{sr.size}</td>
                        <td>{returned}</td>
                        <td><Input type="number" min="0" value={sr.passed} onChange={(e) => updQC(sr.size, "passed", e.target.value)} className="w-20" data-testid={`qc-${sr.size}-pass`} /></td>
                        <td><Input type="number" min="0" value={sr.rework} onChange={(e) => updQC(sr.size, "rework", e.target.value)} className="w-20" /></td>
                        <td><Input type="number" min="0" value={sr.hold} onChange={(e) => updQC(sr.size, "hold", e.target.value)} className="w-20" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {qcEntryError && <div role="alert" className="text-red-700 text-sm">Size {qcEntryError.size}: Pass + Rework + Hold must equal Received ({qcReceivedQty(qcEntryError.size)}).</div>}
              <div>
                <Label>Defects (comma separated)</Label>
                <Input value={qc.defects.join(",")} onChange={(e) => setQc({ ...qc, defects: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <Textarea placeholder="Remarks" value={qc.remarks} onChange={(e) => setQc({ ...qc, remarks: e.target.value })} />
            </div>
            <DialogFooter><Button onClick={submitQC} disabled={!!qcEntryError} data-testid="confirm-qc">Save QC</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </>;
      case "REWORK":
        return qcResolutionActions();
      case "HOLD":
        return qcResolutionActions();
      case "FINISHED":
        return <Link to="/dispatch/new"><Button data-testid="btn-goto-dispatch">Dispatch</Button></Link>;
      default:
        return null;
    }
  };

  return (
    <div data-testid="plan-detail-page">
      <PageHeader title={plan.plan_no}
        subtitle={`${article?.code || ""} ${article?.name || ""} · ${colour?.name || ""} · ${plan.plan_config_name}`}
        actions={
          <div className="flex gap-2">
            {actionButton()}
            {!["CANCELLED", "DISPATCHED"].includes(plan.status) && (
              <Button variant="outline" onClick={() => setCancelOpen(true)} data-testid="btn-cancel-plan" className="text-red-600 border-red-300 hover:bg-red-50">
                <XCircle size={14} className="mr-1" />Cancel Plan
              </Button>
            )}
          </div>
        } />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Cancel Plan {plan.plan_no}?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2">
            <div className="text-sm text-slate-600">Any consumed materials will be returned to stock. QC-passed pairs (if any) will be removed from finished stock. This action cannot be undone.</div>
            <Textarea placeholder="Reason for cancellation" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} data-testid="cancel-plan-reason" />
          </div>
          <DialogFooter><Button variant="destructive" onClick={cancelPlan} data-testid="confirm-cancel-plan">Confirm Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-4 lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-slate-500 text-xs uppercase">CO</div><div className="font-mono">{plan.co_no}</div></div>
            <div><div className="text-slate-500 text-xs uppercase">Qty</div><div className="font-mono font-semibold text-xl">{plan.qty}</div></div>
            <div><div className="text-slate-500 text-xs uppercase">Stage</div><div>{plan.current_stage}</div></div>
            <div><div className="text-slate-500 text-xs uppercase">Status</div><div><StatusBadge status={plan.status} /></div></div>
            <div><div className="text-slate-500 text-xs uppercase">Due</div><div>{plan.due_date ? new Date(plan.due_date).toLocaleDateString() : "-"}</div></div>
            <div><div className="text-slate-500 text-xs uppercase">Priority</div><div>{plan.priority}</div></div>
            <div><div className="text-slate-500 text-xs uppercase">Fabricator</div><div>{plan.fabricator_name || "-"}</div></div>
            <div><div className="text-slate-500 text-xs uppercase">Dispatched</div><div className="font-mono">{plan.dispatched_qty || 0}</div></div>
            <div><div className="text-slate-500 text-xs uppercase">Dispatch Date</div><div data-testid="plan-detail-dispatch-date">{plan.dispatch_date ? new Date(plan.dispatch_date).toLocaleDateString() : "-"}</div></div>
          </div>
          <div className="mt-4">
            <div className="text-xs uppercase text-slate-500 font-semibold mb-1">Size Breakup</div>
            <table className="data-table w-full max-w-lg">
              <thead><tr><th>Size</th>{plan.sizes_snapshot.map((s) => <th key={s.size} className="font-mono">{s.size}</th>)}<th>Total</th></tr></thead>
              <tbody><tr><td>Pairs</td>{plan.sizes_snapshot.map((s) => <td key={s.size} className="font-mono">{s.pairs}</td>)}<td className="font-mono font-semibold">{plan.qty}</td></tr></tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-display font-semibold mb-2">Timeline</div>
          <div className="space-y-2 text-sm">
            {(plan.events || []).map((e, i) => (
              <div key={i} className="border-l-2 border-blue-500 pl-3 pb-2">
                <div className="font-semibold">{e.action}</div>
                <div className="text-xs text-slate-500 font-mono">{new Date(e.at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {shortages && (
        <Card className="p-4 mb-6 border-red-300 bg-red-50">
          <div className="font-display font-semibold text-red-800 mb-2">Material Shortage - Cutting Blocked</div>
          <table className="data-table w-full">
            <thead><tr><th>Material</th><th>Required</th><th>Available</th><th>Shortage</th></tr></thead>
            <tbody>{shortages.map((s, i) => <tr key={i}><td>{s.material_name}</td><td>{s.required} {s.uom}</td><td>{s.available} {s.uom}</td><td className="text-red-700 font-semibold">{s.shortage} {s.uom}</td></tr>)}</tbody>
          </table>
          <div className="text-sm mt-2 text-red-700 font-semibold">PURCHASE REQUIRED. No material was deducted. Plan remains PLANNED.</div>
        </Card>
      )}

      {plan.returns?.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="flex justify-between items-center mb-2"><div className="font-display font-semibold">Stitching Returns</div><a href={`/print/stitching/${plan.id}`} target="_blank" rel="noreferrer" className="text-blue-600 text-sm" data-testid="print-stitching-return"><Printer size={14} className="inline mr-1" />Print Packing List</a></div>
          {plan.returns.map((r) => (
            <div key={r.id} className="mb-3" data-testid={`saved-return-${r.id}`}>
              <div className="text-sm"><span className="font-mono">{plan.plan_no}</span> · {new Date(r.return_date).toLocaleDateString()}</div>
              <table className="data-table w-full mt-1" data-testid={`saved-packing-table-${r.id}`}>
                <thead><tr><th>S. No.</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th><th>Status</th></tr></thead>
                <tbody>{r.bags.map((b, i) => (
                  <tr key={i}><td data-testid={`saved-serial-${r.id}-${i + 1}`}>{i + 1}</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{b.sizes.find((x) => x.size === s.size)?.qty || 0}</td>)}<td>{b.total}</td><td>{b.dispatched ? "Dispatched" : "Available"}</td></tr>
                ))}<tr className="font-semibold"><td>TOTAL</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{r.size_totals[s.size]}</td>)}<td>{r.total_pairs}</td><td></td></tr></tbody>
              </table>
              <div className="flex gap-6 mt-2 font-semibold"><span data-testid={`saved-return-bags-${r.id}`}>TOTAL BAGS: {r.total_bags ?? "Not configured"}</span><span data-testid={`saved-return-pairs-${r.id}`}>TOTAL PAIRS: {r.total_pairs}</span></div>
              {r.packing_error && <div data-testid={`saved-packing-error-${r.id}`} className="text-amber-700 text-sm">{r.packing_error}</div>}
            </div>
          ))}
        </Card>
      )}

      {plan.qc_records?.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="font-display font-semibold mb-2">QC Records</div>
          {plan.qc_records.map((q) => (
            <div key={q.id} className="text-sm mb-2 flex items-center justify-between border-b py-1">
              <div><span className="font-mono">{plan.plan_no}</span> · {new Date(q.inspection_date).toLocaleString()} · Pass: {q.total_pass} · Rework: {q.total_rework} · Hold: {q.total_hold}</div>
              <a href={`/print/qc/${q.id}`} target="_blank" rel="noreferrer" className="text-blue-600 text-xs"><Printer size={12} className="inline mr-1" />Print</a>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
