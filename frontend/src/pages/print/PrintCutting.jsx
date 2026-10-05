import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import PrintHeader from "@/components/PrintHeader";

export default function PrintCutting() {
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [comps, setComps] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    api.get(`/plans/${planId}`).then((p) => {
      setPlan(p);
      if (p.component_configs?.length) setComps(p.component_configs);
      else api.get(`/component-configs?plan_config_id=${p.plan_config_id}`).then(setComps).catch(() => setComps([]));
    });
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [planId]);

  if (!plan) return <div>Loading...</div>;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);
  const totalBundles = comps.reduce((a, c) => a + (c.bundles?.length || 0), 0);
  const bundleText = (bundle) => (bundle.sizes || []).map((s) => `Size ${s.size}: ${s.qty}`).join(" / ") || bundle.formula || "—";

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end gap-2"><Button onClick={() => window.print()} data-testid="print-trigger-button"><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page" data-testid="print-slip-container">
        <PrintHeader title="Cutting Order" subtitle="Production Work Slip" />
        <div className="doc-meta">
          <div><span className="lbl">CO No.</span><span className="val">{plan.co_no}</span></div>
          <div><span className="lbl">Plan No.</span><span className="val">{plan.plan_no}</span></div>
          <div><span className="lbl">Date</span><span className="val">{new Date(plan.plan_date).toLocaleDateString()}</span></div>
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

        <div className="section-title">Component-wise Bundle Configuration</div>
        <table>
          <thead><tr><th style={{width: '24%'}}>Component</th><th style={{width: '15%'}}>Bundle No.</th><th>Size-wise Bifurcation</th><th style={{width: '15%'}}>Total Pairs</th></tr></thead>
          <tbody>
            {comps.length === 0 && <tr><td colSpan="4">No components configured</td></tr>}
            {comps.flatMap((c) => c.bundles.map((b, index) => <tr key={`${c.id}-${b.bundle_no}`}><td>{index === 0 ? c.component : ""}</td><td>{b.bundle_no}</td><td style={{textAlign: 'left'}}>{bundleText(b)}</td><td>{b.total ?? (b.sizes || []).reduce((sum, s) => sum + (s.qty || 0), 0)}</td></tr>))}
          </tbody>
        </table>
        <div className="totals-strip"><div><div className="k">Total Bundles</div><div className="v">{totalBundles}</div></div></div>

        <div className="sign-block">
          <div>Worker Name: <span className="blank-line" /><div className="sign-line">Worker Signature</div></div>
          <div>Date/Time: <span className="blank-line" /><div className="sign-line">Supervisor Signature</div></div>
        </div>
      </div>
    </div>
  );
}
