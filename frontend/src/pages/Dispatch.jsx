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
  const [cancelId, setCancelId] = useState(null);
  const [reason, setReason] = useState("");

  const load = () => api.get("/dispatches").then(setDispatches);
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

  return (
    <div data-testid="dispatch-page">
      <PageHeader title="Dispatch" subtitle="Finished stock dispatch" actions={<Link to="/dispatch/new"><Button data-testid="new-dispatch">+ New Dispatch</Button></Link>} />
      <Card>
        <table className="data-table w-full">
          <thead><tr><th>Dispatch No.</th><th>Date</th><th>Total Bags</th><th>Total Pairs</th><th>Transporter</th><th>Vehicle/LR</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {dispatches.length === 0 && <tr><td colSpan="8" className="text-center text-slate-500 py-8">No dispatches</td></tr>}
            {dispatches.map((d) => (
              <tr key={d.id} data-testid={`dispatch-row-${d.dispatch_no}`}>
                <td className="font-mono">{d.dispatch_no}</td>
                <td className="text-sm">{new Date(d.dispatch_date).toLocaleDateString()}</td>
                <td className="font-mono">{d.total_bags}</td>
                <td className="font-mono font-semibold">{d.total_pairs}</td>
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
        <DialogContent>
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
