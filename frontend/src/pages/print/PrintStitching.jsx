import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function PrintStitching() {
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [comps, setComps] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    api.get(`/plans/${planId}`).then((p) => { setPlan(p); api.get(`/component-configs?plan_config_id=${p.plan_config_id}`).then(setComps); });
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [planId]);
  if (!plan) return null;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()}><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page print-a4">
        <h1>STITCHING JOB CARD</h1>
        <table className="mb-2"><tbody>
          <tr><td>Stitching No.</td><td>{plan.stitching_no}</td><td>Plan No.</td><td>{plan.plan_no}</td></tr>
          <tr><td>Fabricator</td><td colSpan="3">{plan.fabricator_name}</td></tr>
          <tr><td>Article</td><td>{article?.code}</td><td>Colour</td><td>{colour?.name}</td></tr>
          <tr><td>Configuration</td><td>{plan.plan_config_name}</td><td>Plan Qty</td><td><strong>{plan.qty}</strong></td></tr>
        </tbody></table>
        <div className="text-xs font-semibold mb-1">SIZE BREAKUP</div>
        <table className="mb-3"><thead><tr><th>Size</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th></tr></thead>
          <tbody><tr><td>Pairs</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{s.pairs}</td>)}<td><strong>{plan.qty}</strong></td></tr></tbody></table>
        <div className="text-xs font-semibold mb-1">COMPONENT / BUNDLES</div>
        <table className="mb-3"><thead><tr><th>Component</th><th>Bundle Formula</th><th>Bundles</th></tr></thead>
          <tbody>{comps.map((c) => <tr key={c.id}><td>{c.component}</td><td className="text-left">{c.bundles.map((b) => `${b.bundle_no}: ${b.formula} = ${b.total}`).join(" | ")}</td><td>{c.bundles.length}</td></tr>)}</tbody></table>
        <div className="text-xs font-semibold mb-1">PACKING / RETURN (fill on return)</div>
        <table className="mb-3"><thead><tr><th>Bag</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th><th>Good</th><th>Rework</th><th>Reject</th><th>Remarks</th></tr></thead>
          <tbody>{[1,2,3,4,5,6].map((n) => <tr key={n}><td>{n}</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>&nbsp;</td>)}<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>)}</tbody></table>
        <div className="mt-6 grid grid-cols-2 gap-6 text-xs">
          <div>_________________<br />Fabricator Signature</div>
          <div>_________________<br />Supervisor Signature</div>
        </div>
      </div>
    </div>
  );
}
