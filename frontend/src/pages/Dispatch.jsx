import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card, StatusBadge } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Printer } from "lucide-react";

export default function Dispatch() {
  const [dispatches, setDispatches] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerFilter, setCustomerFilter] = useState("ALL");
  const [monthFilter, setMonthFilter] = useState("");
  const [cancelId, setCancelId] = useState(null);
  const [reason, setReason] = useState("");

  const load = () => { api.get("/dispatches").then(setDispatches); api.get("/customers").then(setCustomers); };
  useEffect(() => { load(); }, []);

  const cancel = async () => {
    if (!reason.trim()) return toast.error("Enter reason");
    try {
      await api.post(`/dispatches/${cancelId}/cancel`, { reason });
      toast.success("Dispatch cancelled");
      setCancelId(null); setReason("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const customerName = (id) => customers.find((customer) => customer.id === id)?.name || "-";
  const filteredDispatches = dispatches.filter((dispatch) =>
    (customerFilter === "ALL" || dispatch.customer_id === customerFilter)
    && (!monthFilter || (dispatch.dispatch_date || "").slice(0, 7) === monthFilter)
  );
  const download = () => {
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [["Dispatch No.", "Date", "Customer", "CO No.", "Plan No.", "Bags", "Pairs", "Transporter", "Vehicle/LR", "Status", "Remarks"], ...filteredDispatches.map((dispatch) => [
      dispatch.dispatch_no, (dispatch.dispatch_date || "").slice(0, 10), customerName(dispatch.customer_id), (dispatch.co_nos || []).join(" / "),
      (dispatch.packing_groups || []).map((group) => group.plan_no).join(" / "), dispatch.total_bags ?? "", dispatch.total_pairs,
      dispatch.transporter, dispatch.vehicle_lr, dispatch.status, dispatch.remarks,
    ])];
    const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `dispatch-details-${monthFilter || "all-months"}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  return (
    <div data-testid="dispatch-page">
      <PageHeader title="Dispatch" subtitle="Finished stock dispatch" actions={<Link to="/dispatch/new"><Button data-testid="new-dispatch">+ New Dispatch</Button></Link>} />
      <Card className="p-4 mb-4"><div className="flex flex-wrap items-end gap-3"><div><label className="text-sm font-medium">Customer</label><select className="block border rounded px-3 py-2 mt-1 min-w-52" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} data-testid="dispatch-main-customer-filter"><option value="ALL">All customers</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div><label className="text-sm font-medium">Dispatch month</label><input className="block border rounded px-3 py-2 mt-1" type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} data-testid="dispatch-main-month-filter" /></div><Button variant="outline" onClick={() => { setCustomerFilter("ALL"); setMonthFilter(""); }}>Clear Filters</Button><Button onClick={download} disabled={!filteredDispatches.length} data-testid="download-dispatch-details">Download Filtered CSV</Button></div></Card>
      <Card>
        <table className="data-table w-full">
          <thead><tr><th>Dispatch No.</th><th>Date</th><th>Customer</th><th>Total Bags</th><th>Total Pairs</th><th>Transporter</th><th>Vehicle/LR</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredDispatches.length === 0 && <tr><td colSpan="9" className="text-center text-slate-500 py-8">No dispatches match the selected filters</td></tr>}
            {filteredDispatches.map((d) => (
              <tr key={d.id} data-testid={`dispatch-row-${d.dispatch_no}`}>
                <td className="font-mono">{d.dispatch_no}</td>
                <td className="text-sm">{new Date(d.dispatch_date).toLocaleDateString()}</td>
                <td>{customerName(d.customer_id)}</td>
                <td className="font-mono" data-testid={`dispatch-bags-${d.id}`}>{d.total_bags ?? <span className="text-amber-700 text-xs">Packing rule needed</span>}</td>
                <td className="font-mono font-semibold" data-testid={`dispatch-pairs-${d.id}`}>{d.total_pairs}</td>
                <td>{d.transporter || "-"}</td>
                <td>{d.vehicle_lr || "-"}</td>
                <td><StatusBadge status={d.status} /></td>
                <td className="flex gap-2">
                  <a href={`/print/dispatch/${d.id}`} target="_blank" rel="noreferrer" className="text-blue-600 text-sm"><Printer size={14} className="inline" /></a>
                  {d.status !== "CANCELLED" && <Button size="sm" variant="outline" onClick={() => setCancelId(d.id)} data-testid={`cancel-${d.dispatch_no}`}>Cancel</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!cancelId} onOpenChange={(v) => !v && setCancelId(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Cancel Dispatch</DialogTitle></DialogHeader>
          <div className="py-2">
            <div className="text-sm mb-2">This will restore finished stock, plan quantities and bags.</div>
            <Textarea placeholder="Reason for cancellation" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="cancel-reason" />
          </div>
          <DialogFooter><Button variant="destructive" onClick={cancel} data-testid="confirm-cancel">Confirm Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
