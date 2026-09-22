import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function PrintQC() {
  const { qcId } = useParams();
  const [qc, setQc] = useState(null);
  const [plan, setPlan] = useState(null);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    // Find QC record among all plans
    (async () => {
      const plans = await api.get("/plans");
      for (const p of plans) {
        const full = await api.get(`/plans/${p.id}`);
        const q = full.qc_records.find((x) => x.id === qcId);
        if (q) { setQc(q); setPlan(full); break; }
      }
    })();
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [qcId]);
  if (!qc || !plan) return <div className="p-6">Loading...</div>;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);
  const ret = plan.returns.find((r) => r.id === qc.return_id);

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()}><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page">
        <h1>QC INSPECTION</h1>
        <table className="mb-2"><tbody>
          <tr><td>QC No.</td><td>{qc.qc_no}</td><td>Plan No.</td><td>{plan.plan_no}</td></tr>
          <tr><td>Date</td><td>{new Date(qc.inspection_date).toLocaleString()}</td><td>Fabricator</td><td>{plan.fabricator_name || "-"}</td></tr>
          <tr><td>Article</td><td>{article?.code}</td><td>Colour</td><td>{colour?.name}</td></tr>
        </tbody></table>
        <table className="mb-3"><thead><tr><th>Size</th><th>Returned</th><th>Pass</th><th>Rework</th><th>Hold</th></tr></thead>
          <tbody>{qc.size_results.map((sr) => {
            const r = ret?.size_results?.find((s) => s.size === sr.size);
            const returned = r ? (r.good || 0) + (r.rework || 0) : 0;
            return <tr key={sr.size}><td>{sr.size}</td><td>{returned}</td><td>{sr.passed}</td><td>{sr.rework}</td><td>{sr.hold}</td></tr>;
          })}
            <tr><td><strong>Total</strong></td><td></td><td><strong>{qc.total_pass}</strong></td><td><strong>{qc.total_rework}</strong></td><td><strong>{qc.total_hold}</strong></td></tr>
          </tbody></table>
        {qc.defects.length > 0 && <div className="text-xs mb-2">Defects: {qc.defects.join(", ")}</div>}
        <div className="text-xs mb-4">Remarks: {qc.remarks || "-"}</div>
        <div className="mt-6 grid grid-cols-2 gap-6 text-xs">
          <div>QC Worker: {qc.worker || "____"}<br /><br />_________________<br />QC Signature</div>
          <div>_________________<br />Supervisor Signature</div>
        </div>
      </div>
    </div>
  );
}
