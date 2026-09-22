import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

function SimpleMaster({ title, path, columns, fields, testid }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});

  const load = () => api.get(path).then(setItems);
  useEffect(() => { load(); }, [path]);

  const save = async () => {
    try { await api.post(path, form); toast.success("Saved"); setOpen(false); setForm({}); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display font-semibold">{title}</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" data-testid={`add-${testid}`}><Plus size={14} className="mr-1" />Add</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>New {title}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">{fields.map((f) => <div key={f.name}><Label>{f.label}</Label><Input value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} data-testid={`${testid}-${f.name}`} /></div>)}</div>
            <DialogFooter><Button onClick={save} data-testid={`save-${testid}`}>Save</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
      <table className="data-table w-full">
        <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>{items.length === 0 && <tr><td colSpan={columns.length} className="text-center text-slate-500 py-4">Empty</td></tr>}{items.map((it) => <tr key={it.id}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(it) : it[c.key] ?? "-"}</td>)}</tr>)}</tbody>
      </table>
    </Card>
  );
}

function PlanConfigMaster() {
  const [items, setItems] = useState([]);
  const [articles, setArticles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ article_id: "", name: "", sizes: [{ size: "", pairs: 0 }] });

  const load = () => { api.get("/plan-configs").then(setItems); api.get("/articles").then(setArticles); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.article_id || !form.name) return toast.error("Fill required fields");
    try { await api.post("/plan-configs", { ...form, sizes: form.sizes.filter((s) => s.size && s.pairs > 0).map((s) => ({ ...s, pairs: parseInt(s.pairs) })), active: true }); toast.success("Saved"); setOpen(false); setForm({ article_id: "", name: "", sizes: [{ size: "", pairs: 0 }] }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const addSize = () => setForm({ ...form, sizes: [...form.sizes, { size: "", pairs: 0 }] });
  const updSize = (i, k, v) => { const ss = [...form.sizes]; ss[i] = { ...ss[i], [k]: v }; setForm({ ...form, sizes: ss }); };
  const rmSize = (i) => setForm({ ...form, sizes: form.sizes.filter((_, idx) => idx !== i) });

  const aName = (id) => articles.find((a) => a.id === id)?.code || "-";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display font-semibold">Plan Configurations</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" data-testid="add-pc"><Plus size={14} className="mr-1" />Add</Button></DialogTrigger>
          <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>New Plan Configuration</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Article</Label><Select value={form.article_id} onValueChange={(v) => setForm({ ...form, article_id: v })}><SelectTrigger data-testid="pc-article"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{articles.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Configuration Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kids 2-5" data-testid="pc-name" /></div>
              <div>
                <div className="flex items-center justify-between mb-1"><Label>Sizes</Label><Button size="sm" variant="outline" onClick={addSize} data-testid="add-size">+ Add Size</Button></div>
                <table className="w-full">
                  <thead><tr className="text-xs text-slate-500"><th className="text-left">Size</th><th className="text-left">Pairs/Plan</th><th></th></tr></thead>
                  <tbody>{form.sizes.map((s, i) => <tr key={i}><td className="pr-2"><Input value={s.size} onChange={(e) => updSize(i, "size", e.target.value)} data-testid={`size-${i}-name`} /></td><td className="pr-2"><Input type="number" value={s.pairs} onChange={(e) => updSize(i, "pairs", e.target.value)} data-testid={`size-${i}-pairs`} /></td><td><Button variant="ghost" size="sm" onClick={() => rmSize(i)}><Trash2 size={14} /></Button></td></tr>)}</tbody>
                </table>
                <div className="text-sm mt-2 font-mono">Total: {form.sizes.reduce((a, s) => a + (parseInt(s.pairs) || 0), 0)}</div>
              </div>
            </div>
            <DialogFooter><Button onClick={save} data-testid="save-pc">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <table className="data-table w-full">
        <thead><tr><th>Article</th><th>Name</th><th>Sizes</th><th>Total Pairs</th></tr></thead>
        <tbody>{items.map((it) => <tr key={it.id}><td>{aName(it.article_id)}</td><td>{it.name}</td><td className="text-xs font-mono">{it.sizes.map((s) => `${s.size}:${s.pairs}`).join(" · ")}</td><td className="font-mono font-semibold">{it.total_pairs}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

export default function Masters() {
  return (
    <div data-testid="masters-page">
      <PageHeader title="Masters" subtitle="Configure factory master data" />
      <Tabs defaultValue="customers">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="colours">Colours</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="fabricators">Fabricators</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="plan-configs">Plan Configs</TabsTrigger>
        </TabsList>
        <TabsContent value="customers"><SimpleMaster title="Customers" path="/customers" testid="cust" columns={[{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address" }]} fields={[{ name: "name", label: "Name" }, { name: "phone", label: "Phone" }, { name: "address", label: "Address" }]} /></TabsContent>
        <TabsContent value="articles"><SimpleMaster title="Articles" path="/articles" testid="art" columns={[{ key: "code", label: "Code" }, { key: "name", label: "Name" }]} fields={[{ name: "code", label: "Code" }, { name: "name", label: "Name" }]} /></TabsContent>
        <TabsContent value="colours"><SimpleMaster title="Colours" path="/colours" testid="col" columns={[{ key: "name", label: "Name" }]} fields={[{ name: "name", label: "Name" }]} /></TabsContent>
        <TabsContent value="materials"><SimpleMaster title="Materials" path="/materials" testid="mat" columns={[{ key: "name", label: "Name" }, { key: "uom", label: "UOM" }, { key: "current_stock", label: "Current" }]} fields={[{ name: "name", label: "Name" }, { name: "code", label: "Code" }, { name: "uom", label: "UOM" }]} /></TabsContent>
        <TabsContent value="fabricators"><SimpleMaster title="Fabricators" path="/fabricators" testid="fab" columns={[{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }]} fields={[{ name: "name", label: "Name" }, { name: "phone", label: "Phone" }, { name: "address", label: "Address" }]} /></TabsContent>
        <TabsContent value="workers"><SimpleMaster title="Workers" path="/workers" testid="wkr" columns={[{ key: "name", label: "Name" }, { key: "role", label: "Role" }]} fields={[{ name: "name", label: "Name" }, { name: "role", label: "Role" }]} /></TabsContent>
        <TabsContent value="plan-configs"><PlanConfigMaster /></TabsContent>
      </Tabs>
    </div>
  );
}
