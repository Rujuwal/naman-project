import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function StockRoom() {
  const [rm, setRm] = useState([]);
  const [req, setReq] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [finished, setFinished] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tx, setTx] = useState({ material_id: "", kind: "PURCHASE", qty: 0, remarks: "" });
  const [open, setOpen] = useState(false);

  const load = () => {
    api.get("/rm-stock").then(setRm);
    api.get("/material-requirement").then(setReq);
    api.get("/rm-ledger").then(setLedger);
    api.get("/finished-stock").then(setFinished);
    api.get("/materials").then(setMaterials);
  };
  useEffect(() => { load(); }, []);

  const saveTx = async () => {
    if (!tx.material_id || !tx.qty) return toast.error("Fill all fields");
    try {
      await api.post("/rm-transactions", { ...tx, qty: parseFloat(tx.qty) });
      toast.success("Transaction saved");
      setOpen(false); setTx({ material_id: "", kind: "PURCHASE", qty: 0, remarks: "" });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const mName = (id) => materials.find((m) => m.id === id)?.name || "-";

  return (
    <div data-testid="stock-room-page">
      <PageHeader title="Stock Room" subtitle="Raw material & finished stock" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="new-rm-tx">+ RM Transaction</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>RM Transaction</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Material</Label><Select value={tx.material_id} onValueChange={(v) => setTx({ ...tx, material_id: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Kind</Label><Select value={tx.kind} onValueChange={(v) => setTx({ ...tx, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="OPENING">Opening</SelectItem><SelectItem value="PURCHASE">Purchase</SelectItem><SelectItem value="ADJUSTMENT_IN">Adjustment In</SelectItem><SelectItem value="ADJUSTMENT_OUT">Adjustment Out</SelectItem></SelectContent></Select></div>
              <div><Label>Quantity</Label><Input type="number" step="0.01" value={tx.qty} onChange={(e) => setTx({ ...tx, qty: e.target.value })} data-testid="tx-qty" /></div>
              <div><Label>Remarks</Label><Input value={tx.remarks} onChange={(e) => setTx({ ...tx, remarks: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={saveTx} data-testid="save-tx">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>} />

      <Tabs defaultValue="rm">
        <TabsList>
          <TabsTrigger value="rm">RM Stock</TabsTrigger>
          <TabsTrigger value="req">Material Requirement</TabsTrigger>
          <TabsTrigger value="ledger">RM Ledger</TabsTrigger>
          <TabsTrigger value="finished">Finished Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="rm">
          <Card><table className="data-table w-full"><thead><tr><th>Material</th><th>UOM</th><th>Current</th><th>Committed</th><th>Free</th></tr></thead>
            <tbody>{rm.map((m) => <tr key={m.material_id}><td>{m.material_name}</td><td>{m.uom}</td><td className="font-mono">{m.current}</td><td className="font-mono">{m.committed}</td><td className="font-mono font-semibold">{m.free}</td></tr>)}</tbody></table></Card>
        </TabsContent>
        <TabsContent value="req">
          <Card><table className="data-table w-full"><thead><tr><th>Material</th><th>Required</th><th>Current</th><th>Shortage</th><th>Purchase Required</th></tr></thead>
            <tbody>{req.map((m) => <tr key={m.material_id}><td>{m.material_name}</td><td className="font-mono">{m.required}</td><td className="font-mono">{m.current}</td><td className={`font-mono ${m.shortage > 0 ? "text-red-600 font-semibold" : ""}`}>{m.shortage}</td><td className={`font-mono ${m.purchase_required > 0 ? "text-red-600 font-semibold" : ""}`}>{m.purchase_required}</td></tr>)}</tbody></table></Card>
        </TabsContent>
        <TabsContent value="ledger">
          <Card><table className="data-table w-full"><thead><tr><th>Date</th><th>Material</th><th>Kind</th><th>Qty</th><th>Remarks</th></tr></thead>
            <tbody>{ledger.map((l) => <tr key={l.id}><td className="font-mono text-xs">{new Date(l.at).toLocaleString()}</td><td>{mName(l.material_id)}</td><td className="text-xs">{l.kind}</td><td className={`font-mono ${l.signed_qty < 0 ? "text-red-600" : "text-green-600"}`}>{l.signed_qty > 0 ? "+" : ""}{l.signed_qty}</td><td className="text-xs">{l.remarks || "-"}</td></tr>)}</tbody></table></Card>
        </TabsContent>
        <TabsContent value="finished">
          <Card><table className="data-table w-full"><thead><tr><th>Article</th><th>Colour</th><th>Config</th><th>Plan</th><th>Size</th><th>Qty</th></tr></thead>
            <tbody>{finished.length === 0 && <tr><td colSpan="6" className="text-center text-slate-500 py-4">No finished stock</td></tr>}{finished.map((f, i) => <tr key={i}><td>{f.article_name}</td><td>{f.colour_name}</td><td>{f.plan_config_name}</td><td className="font-mono">{f.plan_no}</td><td className="font-mono">{f.size}</td><td className="font-mono font-semibold">{f.qty}</td></tr>)}</tbody></table></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
