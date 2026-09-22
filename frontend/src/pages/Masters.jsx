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
  const [editing, setEditing] = useState(null);
  const empty = { article_id: "", name: "", pairs_per_bag: "", sizes: [{ size: "", pairs: 0, pairs_per_bag: "" }] };
  const [form, setForm] = useState(empty);
  const load = () => { api.get("/plan-configs").then(setItems); api.get("/articles").then(setArticles); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (pc) => { setEditing(pc.id); setForm({ ...pc, pairs_per_bag: pc.pairs_per_bag ?? "" }); setOpen(true); };
  const updSize = (i, k, v) => setForm((prev) => ({ ...prev, sizes: prev.sizes.map((s, n) => n === i ? { ...s, [k]: v } : s) }));
  const save = async () => {
    if (!form.article_id || !form.name || !form.sizes.length) return toast.error("Fill required fields");
    const positiveInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
    if (form.sizes.some((s) => !s.size || !positiveInt(s.pairs) || !positiveInt(s.pairs_per_bag || form.pairs_per_bag))) return toast.error("Each size needs whole positive pairs and a Pairs Per Bag rule");
    if (form.pairs_per_bag !== "" && !positiveInt(form.pairs_per_bag)) return toast.error("Pairs Per Bag must be a positive whole number");
    if (new Set(form.sizes.map((s) => s.size)).size !== form.sizes.length) return toast.error("Sizes must be unique");
    const payload = { ...form, pairs_per_bag: form.pairs_per_bag === "" ? null : Number(form.pairs_per_bag), sizes: form.sizes.map((s) => ({ ...s, pairs: Number(s.pairs), pairs_per_bag: s.pairs_per_bag ? Number(s.pairs_per_bag) : null })) };
    try {
      if (editing) await api.put(`/plan-configs/${editing}`, payload);
      else await api.post("/plan-configs", payload);
      toast.success("Configuration saved"); setOpen(false); load();
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check configuration values"); }
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display font-semibold">Plan Configurations</div>
        <Button size="sm" onClick={openNew} data-testid="add-pc"><Plus size={14} className="mr-1" />Add</Button>
      </div>
      <table className="data-table w-full" data-testid="plan-config-table">
        <thead><tr><th>Article</th><th>Name</th><th>Sizes</th><th>Total Pairs</th><th>Pairs Per Bag</th><th></th></tr></thead>
        <tbody>{items.map((it) => <tr key={it.id} data-testid={`config-${it.id}`}>
          <td>{articles.find((a) => a.id === it.article_id)?.code || "-"}</td><td>{it.name}</td>
          <td className="text-xs font-mono">{it.sizes.map((s) => `${s.size}:${s.pairs}`).join(" · ")}</td><td className="font-mono font-semibold">{it.total_pairs}</td>
          <td data-testid={`config-packing-${it.id}`} className="text-xs">{it.sizes.some((s) => s.pairs_per_bag) ? it.sizes.map((s) => `${s.size}: ${s.pairs_per_bag || it.pairs_per_bag || "Not set"}`).join(" · ") : it.pairs_per_bag || "Not configured"}</td>
          <td><Button size="sm" variant="outline" data-testid={`edit-pc-${it.id}`} onClick={() => openEdit(it)}>Edit</Button></td>
        </tr>)}</tbody>
      </table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined} data-testid="plan-config-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Plan Configuration</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-auto">
            <div><Label>Article</Label><Select value={form.article_id} onValueChange={(v) => setForm((prev) => ({ ...prev, article_id: v }))}><SelectTrigger data-testid="pc-article"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{articles.map((a) => <SelectItem key={a.id} value={a.id} data-testid={`pc-article-${a.id}`}>{a.code} - {a.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Configuration Name</Label><Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Kids 2-5" data-testid="pc-name" /></div>
            <div><Label>Pairs Per Bag</Label><Input type="number" min="1" step="1" value={form.pairs_per_bag} onChange={(e) => setForm((prev) => ({ ...prev, pairs_per_bag: e.target.value }))} placeholder="Pairs of one size per physical bag" data-testid="pc-pairs-per-bag" /></div>
            <p className="text-xs text-slate-500" data-testid="packing-rule-help">Applies to all sizes unless overridden below. Sizes never mix in a physical bag. A partly filled bag counts as one bag. Recorded returns retain their packing rule.</p>
            <div className="flex items-center justify-between"><Label>Sizes</Label><Button size="sm" variant="outline" onClick={() => setForm((prev) => ({ ...prev, sizes: [...prev.sizes, { size: "", pairs: 0, pairs_per_bag: "" }] }))} data-testid="add-size">+ Add Size</Button></div>
            <table className="w-full"><thead><tr className="text-xs text-slate-500"><th>Size</th><th>Pairs / Plan</th><th>Pairs / Bag Override</th><th></th></tr></thead>
              <tbody>{form.sizes.map((s, i) => <tr key={i}>
                <td className="pr-2"><Input value={s.size} onChange={(e) => updSize(i, "size", e.target.value)} data-testid={`size-${i}-name`} /></td>
                <td className="pr-2"><Input type="number" min="1" value={s.pairs} onChange={(e) => updSize(i, "pairs", e.target.value)} data-testid={`size-${i}-pairs`} /></td>
                <td><Input type="number" min="1" value={s.pairs_per_bag ?? ""} placeholder="Use config" onChange={(e) => updSize(i, "pairs_per_bag", e.target.value)} data-testid={`size-${i}-pairs-per-bag`} /></td>
                <td><Button variant="ghost" size="sm" data-testid={`remove-size-${i}`} onClick={() => setForm((prev) => ({ ...prev, sizes: prev.sizes.filter((_, n) => n !== i) }))}><Trash2 size={14} /></Button></td>
              </tr>)}</tbody>
            </table>
            <div className="text-sm font-mono" data-testid="pc-total-pairs">Total: {form.sizes.reduce((a, s) => a + (Number(s.pairs) || 0), 0)}</div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-pc">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BomMaster() {
  const [items, setItems] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const empty = { article_id: "", colour_id: "", version: 1, active: true, lines: [{ material_id: "", consumption_per_pair: 0, uom: "m" }] };
  const [form, setForm] = useState(empty);

  const load = () => {
    api.get("/boms").then(setItems);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
    api.get("/materials").then(setMaterials);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (b) => {
    setEditing(b.id);
    setForm({ article_id: b.article_id, colour_id: b.colour_id || "", version: b.version || 1, active: b.active !== false, lines: b.lines.length ? b.lines : empty.lines });
    setOpen(true);
  };

  const save = async () => {
    if (!form.article_id) return toast.error("Select article");
    const lines = form.lines.filter((l) => l.material_id && parseFloat(l.consumption_per_pair) > 0)
      .map((l) => ({ ...l, consumption_per_pair: parseFloat(l.consumption_per_pair) }));
    if (lines.length === 0) return toast.error("Add at least one BOM line");
    const payload = { ...form, lines, colour_id: form.colour_id || null, version: parseInt(form.version) || 1 };
    try {
      if (editing) await api.put(`/boms/${editing}`, payload);
      else await api.post("/boms", payload);
      toast.success("BOM saved");
      setOpen(false); setForm(empty); setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, { material_id: "", consumption_per_pair: 0, uom: "m" }] }));
  const updLine = (i, k, v) => setForm((prev) => { const ll = [...prev.lines]; ll[i] = { ...ll[i], [k]: v }; return { ...prev, lines: ll }; });
  const rmLine = (i) => setForm((prev) => ({ ...prev, lines: prev.lines.filter((_, idx) => idx !== i) }));

  const aName = (id) => articles.find((a) => a.id === id)?.code || "-";
  const cName = (id) => colours.find((c) => c.id === id)?.name || "Any";
  const mName = (id) => materials.find((m) => m.id === id)?.name || "-";
  const mUom = (id) => materials.find((m) => m.id === id)?.uom || "m";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display font-semibold">Bill of Materials (BOM)</div>
        <Button size="sm" onClick={openNew} data-testid="add-bom"><Plus size={14} className="mr-1" />Add BOM</Button>
      </div>
      <table className="data-table w-full">
        <thead><tr><th>Article</th><th>Colour</th><th>Version</th><th>Lines</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="6" className="text-center text-slate-500 py-4">No BOMs defined</td></tr>}
          {items.map((b) => (
            <tr key={b.id}>
              <td>{aName(b.article_id)}</td>
              <td>{b.colour_id ? cName(b.colour_id) : <span className="text-slate-400 italic">Any colour</span>}</td>
              <td className="font-mono">v{b.version}</td>
              <td className="text-xs">{b.lines.map((l) => `${mName(l.material_id)}: ${l.consumption_per_pair}${l.uom || ""}`).join(" · ")}</td>
              <td>{b.active !== false ? "Active" : "Inactive"}</td>
              <td><Button size="sm" variant="outline" onClick={() => openEdit(b)} data-testid={`edit-bom-${b.id}`}>Edit</Button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{editing ? "Edit BOM" : "New BOM"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-auto">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Article *</Label>
                <Select value={form.article_id} onValueChange={(v) => setForm({ ...form, article_id: v })}>
                  <SelectTrigger data-testid="bom-article"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{articles.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Colour (optional)</Label>
                <Select value={form.colour_id || "__any__"} onValueChange={(v) => setForm({ ...form, colour_id: v === "__any__" ? "" : v })}>
                  <SelectTrigger data-testid="bom-colour"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any colour</SelectItem>
                    {colours.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Version</Label><Input type="number" min="1" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><Label>BOM Lines</Label><Button size="sm" variant="outline" onClick={addLine} data-testid="add-bom-line">+ Add Material</Button></div>
              <table className="w-full">
                <thead><tr className="text-xs text-slate-500"><th className="text-left">Material</th><th className="text-left">Consumption / Pair</th><th className="text-left">UOM</th><th></th></tr></thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="pr-2 py-1">
                        <Select value={l.material_id} onValueChange={(v) => setForm((prev) => { const ll = [...prev.lines]; ll[i] = { ...ll[i], material_id: v, uom: mUom(v) }; return { ...prev, lines: ll }; })}>
                          <SelectTrigger data-testid={`bom-line-${i}-mat`}><SelectValue placeholder="Material" /></SelectTrigger>
                          <SelectContent>{materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="pr-2"><Input type="number" step="0.0001" min="0" value={l.consumption_per_pair} onChange={(e) => updLine(i, "consumption_per_pair", e.target.value)} data-testid={`bom-line-${i}-qty`} /></td>
                      <td className="pr-2"><Input value={l.uom} onChange={(e) => updLine(i, "uom", e.target.value)} className="w-16" /></td>
                      <td><Button variant="ghost" size="sm" onClick={() => rmLine(i)}><Trash2 size={14} /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-slate-500 mt-2">Consumption is per pair. Example: 0.4 m Rexine per pair × 480 pairs = 192 m required.</div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-bom">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
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
          <TabsTrigger value="plan-configs" data-testid="masters-plan-configs">Plan Configs</TabsTrigger>
          <TabsTrigger value="boms">BOM</TabsTrigger>
        </TabsList>
        <TabsContent value="customers"><SimpleMaster title="Customers" path="/customers" testid="cust" columns={[{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address" }]} fields={[{ name: "name", label: "Name" }, { name: "phone", label: "Phone" }, { name: "address", label: "Address" }]} /></TabsContent>
        <TabsContent value="articles"><SimpleMaster title="Articles" path="/articles" testid="art" columns={[{ key: "code", label: "Code" }, { key: "name", label: "Name" }]} fields={[{ name: "code", label: "Code" }, { name: "name", label: "Name" }]} /></TabsContent>
        <TabsContent value="colours"><SimpleMaster title="Colours" path="/colours" testid="col" columns={[{ key: "name", label: "Name" }]} fields={[{ name: "name", label: "Name" }]} /></TabsContent>
        <TabsContent value="materials"><SimpleMaster title="Materials" path="/materials" testid="mat" columns={[{ key: "name", label: "Name" }, { key: "uom", label: "UOM" }, { key: "current_stock", label: "Current" }]} fields={[{ name: "name", label: "Name" }, { name: "code", label: "Code" }, { name: "uom", label: "UOM" }]} /></TabsContent>
        <TabsContent value="fabricators"><SimpleMaster title="Fabricators" path="/fabricators" testid="fab" columns={[{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }]} fields={[{ name: "name", label: "Name" }, { name: "phone", label: "Phone" }, { name: "address", label: "Address" }]} /></TabsContent>
        <TabsContent value="workers"><SimpleMaster title="Workers" path="/workers" testid="wkr" columns={[{ key: "name", label: "Name" }, { key: "role", label: "Role" }]} fields={[{ name: "name", label: "Name" }, { name: "role", label: "Role" }]} /></TabsContent>
        <TabsContent value="plan-configs"><PlanConfigMaster /></TabsContent>
        <TabsContent value="boms"><BomMaster /></TabsContent>
      </Tabs>
    </div>
  );
}
