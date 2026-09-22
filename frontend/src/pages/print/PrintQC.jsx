import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import PrintHeader from "@/components/PrintHeader";

const DEFECTS = ["Open Stitching", "Loose Thread", "Wrong Stitching", "Uneven Stitching", "Misalignment", "Pair Mismatch", "Damaged Component", "Stain / Mark", "Other"];

export default function PrintQC() {
  const { qcId } = useParams();
  const [qc, setQc] = useState(null);
  const [plan, setPlan] = useState(null);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    api.get(`/qc-records/${qcId}`).then((data) => { setQc(data.qc); setPlan(data.plan); });
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [qcId]);
  if (!qc || !plan) return <div className="p-6">Loading...</div>;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);
  const ret = plan.returns.find((r) => r.id === qc.return_id);

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()} data-testid="print-trigger-button"><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page" data-testid="print-slip-container">
        <PrintHeader title="QC Inspection Slip" subtitle="Completed Record" />
        <div className="doc-meta">
          <div><span className="lbl">QC No.</span><span className="val" data-testid="print-qc-number">{qc.qc_no}</span></div>
          <div><span className="lbl">Plan No.</span><span className="val" data-testid="print-plan-number">{plan.plan_no}</span></div>
          <div><span className="lbl">Date</span><span className="val" data-testid="print-qc-date">{new Date(qc.inspection_date).toLocaleDateString()}</span></div>
          <div><span className="lbl">Fabricator</span><span className="val">{plan.fabricator_name || "-"}</span></div>
          <div><span className="lbl">Article</span><span className="val">{article?.code} — {article?.name}</span></div>
          <div><span className="lbl">Colour</span><span className="val">{colour?.name}</span></div>
          <div><span className="lbl">Configuration</span><span className="val">{plan.plan_config_name}</span></div>
          <div><span className="lbl">Return Ref</span><span className="val">{ret?.return_no || "-"}</span></div>
        </div>

        <div className="section-title">Size-wise Inspection</div>
        <table>
          <thead><tr><th>Size</th><th>Returned</th><th>Pass</th><th>Rework</th><th>Hold</th></tr></thead>
          <tbody>
            {qc.size_results.map((sr) => {
              const r = ret?.size_results?.find((s) => s.size === sr.size);
              const returned = r ? (r.good || 0) + (r.rework || 0) : 0;
              return <tr key={sr.size}><td>{sr.size}</td><td>{returned}</td><td>{sr.passed}</td><td>{sr.rework}</td><td>{sr.hold}</td></tr>;
            })}
            <tr className="total-row"><td>Total</td><td></td><td>{qc.total_pass}</td><td>{qc.total_rework}</td><td>{qc.total_hold}</td></tr>
          </tbody>
        </table>

        <div className="section-title">Defect Checks</div>
        <div className="check-grid">
          {DEFECTS.map((d) => (
            <div className="chk" key={d}>
              <span className="check-box" style={{background: qc.defects?.includes(d) ? "#0f172a" : "#fff"}} />
              <span>{d}</span>
            </div>
          ))}
        </div>

        <div style={{fontSize: 11, marginTop: 8}}><strong>Remarks:</strong> {qc.remarks || "—"}</div>

        <div className="sign-block">
          <div>QC Worker: <span className="blank-line">{qc.worker || ""}</span><div className="sign-line">QC Signature</div></div>
          <div><div className="sign-line">Supervisor Signature</div></div>
        </div>
      </div>
    </div>
  );
}
