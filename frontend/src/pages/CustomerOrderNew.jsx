import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function CustomerOrderNew() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);
  const [planConfigs, setPlanConfigs] = useState([]);
  const [form, setForm] = useState({
    customer_id: "",
    delivery_date: "",
    priority: "Normal",
    customer_po: "",
    remarks: "",
    items: [],
  });

  useEffect(() => {
    api.get("/customers").then(setCustomers);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
    api.get("/plan-configs").then(setPlanConfigs);
  }, []);

  const addItem = () => setForm({ ...form, items: [...form.items, { article_id: "", plan_config_id: "", colour_id: "", num_plans: 1 }] });
  const rmItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  const updItem = (i, k, v) => {
    const items = [...form.items];
    items[i] = { ...items[i], [k]: v };
    if (k === "article_id") items[i].plan_config_id = "";
    setForm({ ...form, items });
  };

  const qtyPerPlan = (pcid) => {
    const pc = planConfigs.find((p) => p.id === pcid);
    return pc?.total_pairs || 0;
  };

  const submit = async () => {
    if (!form.customer_id) return toast.error("Select customer");
    if (form.items.length === 0) return toast.error("Add at least one item");
    for (const it of form.items) {
      if (!it.article_id || !it.plan_config_id || !it.colour_id || !it.num_plans)
        return toast.error("Complete all item fields");
    }
    try {
      const r = await api.post("/customer-orders", { ...form, delivery_date: form.delivery_date || null });
      toast.success(`Order ${r.co_no} created`);
      nav(`/customer-orders/${r.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div data-testid="new-order-page">
      <PageHeader title="New Customer Order" subtitle="Create a sales order" />
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger data-testid="customer-select"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Delivery Date</Label>
            <Input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Customer PO No.</Label>
            <Input value={form.customer_po} onChange={(e) => setForm({ ...form, customer_po: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Remarks</Label>
            <Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} />
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-semibold">Order Items</div>
          <Button variant="outline" onClick={addItem} data-testid="add-item-btn"><Plus size={16} className="mr-1" />Add Item</Button>
        </div>
        <table className="data-table w-full">
          <thead><tr><th>Article</th><th>Configuration</th><th>Colour</th><th>No. Plans</th><th>Qty/Plan</th><th>Total Qty</th><th></th></tr></thead>
          <tbody>
            {form.items.length === 0 && <tr><td colSpan="7" className="text-center text-slate-500 py-4">No items yet</td></tr>}
            {form.items.map((it, i) => (
              <tr key={i}>
                <td>
                  <Select value={it.article_id} onValueChange={(v) => updItem(i, "article_id", v)}>
                    <SelectTrigger data-testid={`item-${i}-article`}><SelectValue placeholder="Article" /></SelectTrigger>
                    <SelectContent>{articles.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td>
                  <Select value={it.plan_config_id} onValueChange={(v) => updItem(i, "plan_config_id", v)}>
                    <SelectTrigger data-testid={`item-${i}-config`}><SelectValue placeholder="Config" /></SelectTrigger>
                    <SelectContent>
                      {planConfigs.filter((p) => p.article_id === it.article_id).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.total_pairs} pairs)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <Select value={it.colour_id} onValueChange={(v) => updItem(i, "colour_id", v)}>
                    <SelectTrigger data-testid={`item-${i}-colour`}><SelectValue placeholder="Colour" /></SelectTrigger>
                    <SelectContent>{colours.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td><Input type="number" min="1" value={it.num_plans} onChange={(e) => updItem(i, "num_plans", parseInt(e.target.value) || 1)} data-testid={`item-${i}-plans`} className="w-24" /></td>
                <td className="font-mono">{qtyPerPlan(it.plan_config_id)}</td>
                <td className="font-mono font-semibold">{qtyPerPlan(it.plan_config_id) * it.num_plans}</td>
                <td><Button variant="ghost" size="sm" onClick={() => rmItem(i)}><Trash2 size={14} /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav(-1)}>Cancel</Button>
        <Button onClick={submit} data-testid="submit-order">Create Order</Button>
      </div>
    </div>
  );
}
