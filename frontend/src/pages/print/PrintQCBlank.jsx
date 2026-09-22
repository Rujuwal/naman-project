import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import PrintHeader from "@/components/PrintHeader";

const DEFECTS = ["Open Stitching", "Loose Thread", "Wrong Stitching", "Uneven Stitching", "Misalignment", "Pair Mismatch", "Damaged Component", "Stain / Mark", "Other"];

export default function PrintQCBlank() {
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    api.get(`/plans/${planId}`).then(setPlan);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [planId]);
  if (!plan) return <div className="p-6">Loading...</div>;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);
  const ret = plan.returns?.[plan.returns.length - 1];
  const retSize = (sz) => {
    if (!ret) return 0;
    const r = ret.size_results?.find((s) => s.size === sz);
    return r ? (r.good || 0) + (r.rework || 0) : 0;
  };

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()}><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page print-a4">
        <PrintHeader title="QC Inspection Slip" subtitle="Blank — fill on inspection" />
        <div className="doc-meta">
          <div><span className="lbl">QC No.</span><span className="val"><span className="blank-line" /></span></div>
          <div><span className="lbl">Plan No.</span><span className="val">{plan.plan_no}</span></div>
          <div><span className="lbl">Date</span><span className="val"><span className="blank-line" /></span></div>
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
            {plan.sizes_snapshot.map((s) => (
              <tr key={s.size}><td>{s.size}</td><td>{retSize(s.size)}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
            ))}
            <tr className="total-row"><td>Total</td><td>{plan.sizes_snapshot.reduce((a, s) => a + retSize(s.size), 0)}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
          </tbody>
        </table>

        <div className="section-title">Defect Checks</div>
        <div className="check-grid">
          {DEFECTS.map((d) => <div className="chk" key={d}><span className="check-box" /><span>{d}</span></div>)}
        </div>

        <div style={{fontSize: 11, marginTop: 8}}><strong>Remarks:</strong> <span className="blank-line" style={{minWidth: 320}} /></div>

        <div className="sign-block">
          <div>QC Worker: <span className="blank-line" /><div className="sign-line">QC Signature</div></div>
          <div>Date/Time: <span className="blank-line" /><div className="sign-line">Supervisor Signature</div></div>
        </div>
      </div>
    </div>
  );
}
