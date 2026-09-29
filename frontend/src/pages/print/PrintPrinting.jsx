import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import PrintHeader from "@/components/PrintHeader";

export default function PrintPrinting() {
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    api.get(`/plans/${planId}`).then(setPlan);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [planId]);
  if (!plan) return null;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()} data-testid="print-trigger-button"><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page" data-testid="print-slip-container">
        <PrintHeader title="Printing Order" subtitle="Production Work Slip" />
        <div className="doc-meta">
          <div><span className="lbl">Plan No.</span><span className="val">{plan.plan_no}</span></div>
          <div><span className="lbl">Issue Date</span><span className="val">{plan.printing_started_at ? new Date(plan.printing_started_at).toLocaleDateString() : "-"}</span></div>
          <div><span className="lbl">Issue Time</span><span className="val">{plan.printing_started_at ? new Date(plan.printing_started_at).toLocaleTimeString() : "-"}</span></div>
          <div><span className="lbl">Article</span><span className="val">{article?.code} — {article?.name}</span></div>
          <div><span className="lbl">Colour</span><span className="val">{colour?.name}</span></div>
          <div><span className="lbl">Configuration</span><span className="val">{plan.plan_config_name}</span></div>
          <div><span className="lbl">Plan Qty</span><span className="val">{plan.qty} pairs</span></div>
        </div>

        <div className="section-title">Size Breakup</div>
        <table>
          <thead><tr><th>Size</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th></tr></thead>
          <tbody><tr><td>Pairs</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{s.pairs}</td>)}<td><strong>{plan.qty}</strong></td></tr></tbody>
        </table>

        <div className="section-title">Printing Details</div>
        <table>
          <tbody>
            <tr><td style={{width: '30%', textAlign: 'left'}}>Artwork / Printing</td><td style={{textAlign: 'left'}}>&nbsp;</td></tr>
            <tr><td style={{textAlign: 'left'}}>Printing Colour</td><td style={{textAlign: 'left'}}>&nbsp;</td></tr>
            <tr><td style={{textAlign: 'left'}}>Special Instructions</td><td style={{textAlign: 'left', height: '50px'}}>&nbsp;</td></tr>
          </tbody>
        </table>

        <div className="sign-block">
          <div>Worker Name: <span className="blank-line" /><div className="sign-line">Worker Signature</div></div>
          <div>Date/Time: <span className="blank-line" /><div className="sign-line">Supervisor Signature</div></div>
        </div>
      </div>
    </div>
  );
}
