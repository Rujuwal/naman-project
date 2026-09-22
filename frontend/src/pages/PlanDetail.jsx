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
import { Trash2, Plus, Printer } from "lucide-react";

export default function PlanDetail() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [fabricators, setFabricators] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);
  const [shortages, setShortages] = useState(null);

  // fabricator issue form
  const [fab, setFab] = useState({ fabricator_id: "", due_date: "", instructions: "" });
  const [fabOpen, setFabOpen] = useState(false);

  // stitching return
  const [retOpen, setRetOpen] = useState(false);
  const [bags, setBags] = useState([]);
  const [sizeResults, setSizeResults] = useState([]);
  const [retRemarks, setRetRemarks] = useState("");

  // qc
  const [qcOpen, setQcOpen] = useState(false);
  const [qc, setQc] = useState({ size_results: [], defects: [], remarks: "" });

  const load = () => api.get(`/plans/${id}`).then((p) => {
    setPlan(p);
    // init size grids from sizes_snapshot
    setSizeResults(p.sizes_snapshot.map((s) => ({ size: s.size, good: 0, rework: 0, reject: 0 })));
    setQc({
      size_results: p.sizes_snapshot.map((s) => ({ size: s.size, passed: 0, rework: 0, hold: 0 })),
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
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const issuePrinting = async () => {
    try { await api.post(`/plans/${id}/issue-to-printing`); toast.success("Issued to Printing"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const issueFabricator = async () => {
    if (!fab.fabricator_id) return toast.error("Select fabricator");
    try {
      await api.post(`/plans/${id}/issue-to-fabricator`, { ...fab, due_date: fab.due_date || null });
      toast.success("Issued to Fabricator");
      setFabOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const addBag = () => setBags([...bags, { bag_no: `B${bags.length + 1}`, sizes: plan.sizes_snapshot.map((s) => ({ size: s.size, qty: 0 })), remarks: "" }]);
  const rmBag = (i) => setBags(bags.filter((_, idx) => idx !== i));
  const updBag = (i, k, v) => { const bb = [...bags]; bb[i] = { ...bb[i], [k]: v }; setBags(bb); };
  const updBagSize = (i, size, v) => {
    const bb = [...bags];
    bb[i] = { ...bb[i], sizes: bb[i].sizes.map((s) => s.size === size ? { ...s, qty: parseInt(v) || 0 } : s) };
    setBags(bb);
  };

  const updSR = (size, k, v) => setSizeResults(sizeResults.map((s) => s.size === size ? { ...s, [k]: parseInt(v) || 0 } : s));

  const submitReturn = async () => {
    if (bags.length === 0) return toast.error("Add at least one bag");
    try {
      await api.post(`/plans/${id}/receive-stitching`, { bags, size_results: sizeResults, remarks: retRemarks });
      toast.success("Return recorded");
      setRetOpen(false); setBags([]); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const updQC = (size, k, v) => setQc({ ...qc, size_results: qc.size_results.map((s) => s.size === size ? { ...s, [k]: parseInt(v) || 0 } : s) });

  const submitQC = async () => {
    try {
      await api.post(`/plans/${id}/qc`, qc);
      toast.success("QC saved");
      setQcOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const reworkReturn = async () => {
    try { await api.post(`/plans/${id}/rework-return`, { remarks: "" }); toast.success("Sent back to QC"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

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
            <DialogContent>
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
            <DialogContent className="max-w-4xl">
              <DialogHeader><DialogTitle>Stitching Return - {plan.plan_no}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2 max-h-[70vh] overflow-auto">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Bags</div>
                    <Button size="sm" variant="outline" onClick={addBag} data-testid="add-bag"><Plus size={14} className="mr-1" />Add Bag</Button>
                  </div>
                  <table className="data-table w-full">
                    <thead><tr><th>Bag No.</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>Size {s.size}</th>)}<th>Total</th><th>Remarks</th><th></th></tr></thead>
                    <tbody>
                      {bags.map((b, i) => {
                        const total = b.sizes.reduce((a, x) => a + (x.qty || 0), 0);
                        return (
                          <tr key={i}>
                            <td><Input value={b.bag_no} onChange={(e) => updBag(i, "bag_no", e.target.value)} className="w-20" /></td>
                            {b.sizes.map((s) => (
                              <td key={s.size}><Input type="number" min="0" value={s.qty} onChange={(e) => updBagSize(i, s.size, e.target.value)} className="w-16" data-testid={`bag-${i}-size-${s.size}`} /></td>
                            ))}
                            <td className="font-mono font-semibold">{total}</td>
                            <td><Input value={b.remarks} onChange={(e) => updBag(i, "remarks", e.target.value)} className="w-32" /></td>
                            <td><Button variant="ghost" size="sm" onClick={() => rmBag(i)}><Trash2 size={14} /></Button></td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 font-semibold">
                        <td>TOTAL BAGS: {bags.length}</td>
                        {plan.sizes_snapshot.map((s) => <td key={s.size} className="font-mono">{bags.reduce((a, b) => a + (b.sizes.find((x) => x.size === s.size)?.qty || 0), 0)}</td>)}
                        <td className="font-mono">{bags.reduce((a, b) => a + b.sizes.reduce((x, y) => x + (y.qty || 0), 0), 0)}</td>
                        <td colSpan="2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="font-semibold mb-2">Size-wise Good / Rework / Reject</div>
                  <table className="data-table w-full">
                    <thead><tr><th>Size</th><th>Plan Qty</th><th>Good</th><th>Rework</th><th>Reject</th></tr></thead>
                    <tbody>
                      {sizeResults.map((sr) => {
                        const planQty = plan.sizes_snapshot.find((s) => s.size === sr.size)?.pairs || 0;
                        return (
                          <tr key={sr.size}>
                            <td className="font-mono">{sr.size}</td>
                            <td>{planQty}</td>
                            <td><Input type="number" min="0" value={sr.good} onChange={(e) => updSR(sr.size, "good", e.target.value)} className="w-20" data-testid={`sr-${sr.size}-good`} /></td>
                            <td><Input type="number" min="0" value={sr.rework} onChange={(e) => updSR(sr.size, "rework", e.target.value)} className="w-20" /></td>
                            <td><Input type="number" min="0" value={sr.reject} onChange={(e) => updSR(sr.size, "reject", e.target.value)} className="w-20" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Textarea placeholder="Remarks" value={retRemarks} onChange={(e) => setRetRemarks(e.target.value)} />
              </div>
              <DialogFooter><Button onClick={submitReturn} data-testid="confirm-return">Save Return</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>;
      case "QC":
        return <Dialog open={qcOpen} onOpenChange={setQcOpen}>
          <DialogTrigger asChild><Button data-testid="btn-qc">Perform QC</Button></DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>QC - {plan.plan_no}</DialogTitle></DialogHeader>
            <div className="py-2 max-h-[70vh] overflow-auto space-y-3">
              <table className="data-table w-full">
                <thead><tr><th>Size</th><th>Returned</th><th>Pass</th><th>Rework</th><th>Hold</th></tr></thead>
                <tbody>
                  {qc.size_results.map((sr) => {
                    const ret = plan.returns[plan.returns.length - 1];
                    const retSize = ret?.size_results?.find((s) => s.size === sr.size);
                    const returned = retSize ? (retSize.good || 0) + (retSize.rework || 0) : 0;
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
              <div>
                <Label>Defects (comma separated)</Label>
                <Input value={qc.defects.join(",")} onChange={(e) => setQc({ ...qc, defects: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <Textarea placeholder="Remarks" value={qc.remarks} onChange={(e) => setQc({ ...qc, remarks: e.target.value })} />
            </div>
            <DialogFooter><Button onClick={submitQC} data-testid="confirm-qc">Save QC</Button></DialogFooter>
          </DialogContent>
        </Dialog>;
      case "REWORK":
        return <Button onClick={reworkReturn} data-testid="btn-rework-return">Return to QC</Button>;
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
        actions={<div className="flex gap-2">{actionButton()}</div>} />

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
          <div className="font-display font-semibold mb-2">Stitching Returns</div>
          {plan.returns.map((r) => (
            <div key={r.id} className="mb-3">
              <div className="text-sm"><span className="font-mono">{r.return_no}</span> · {new Date(r.return_date).toLocaleString()} · {r.total_returned} pairs · {r.total_bags} bags</div>
              <table className="data-table w-full mt-1">
                <thead><tr><th>Bag</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th><th>Status</th></tr></thead>
                <tbody>{r.bags.map((b, i) => (
                  <tr key={i}><td>{b.bag_no}</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{b.sizes.find((x) => x.size === s.size)?.qty || 0}</td>)}<td>{b.total}</td><td>{b.dispatched ? "Dispatched" : "Available"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </Card>
      )}

      {plan.qc_records?.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="font-display font-semibold mb-2">QC Records</div>
          {plan.qc_records.map((q) => (
            <div key={q.id} className="text-sm mb-2 flex items-center justify-between border-b py-1">
              <div><span className="font-mono">{q.qc_no}</span> · {new Date(q.inspection_date).toLocaleString()} · Pass: {q.total_pass} · Rework: {q.total_rework} · Hold: {q.total_hold}</div>
              <a href={`/print/qc/${q.id}`} target="_blank" rel="noreferrer" className="text-blue-600 text-xs"><Printer size={12} className="inline mr-1" />Print</a>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
