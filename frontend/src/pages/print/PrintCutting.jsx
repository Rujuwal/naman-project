import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function PrintCutting() {
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [comps, setComps] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    api.get(`/plans/${planId}`).then((p) => {
      setPlan(p);
      api.get(`/component-configs?plan_config_id=${p.plan_config_id}`).then(setComps);
    });
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [planId]);

  if (!plan) return <div>Loading...</div>;
  const article = articles.find((a) => a.id === plan.article_id);
  const colour = colours.find((c) => c.id === plan.colour_id);
  const totalBundles = comps.reduce((a, c) => a + (c.bundles?.length || 0), 0);

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end gap-2">
        <Button onClick={() => window.print()}><Printer size={14} className="mr-1" />Print</Button>
      </div>
      <div className="print-page">
        <h1>CUTTING ORDER</h1>
        <div className="text-center text-xs mb-2">PRODUCTION WORK SLIP</div>
        <table className="mb-2">
          <tbody>
            <tr><td>CO No.</td><td>{plan.co_no}</td><td>Plan No.</td><td>{plan.plan_no}</td></tr>
            <tr><td>Date</td><td>{new Date(plan.plan_date).toLocaleDateString()}</td><td>Article</td><td>{article?.code}</td></tr>
            <tr><td>Colour</td><td>{colour?.name}</td><td>Configuration</td><td>{plan.plan_config_name}</td></tr>
          </tbody>
        </table>
        <div className="text-xs font-semibold mt-3 mb-1">SIZE BREAKUP</div>
        <table className="mb-3">
          <thead><tr><th>Size</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th></tr></thead>
          <tbody><tr><td>Pairs</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{s.pairs}</td>)}<td><strong>{plan.qty}</strong></td></tr></tbody>
        </table>
        <div className="text-xs font-semibold mb-1">COMPONENT / BUNDLE DETAILS</div>
        <table className="mb-3">
          <thead><tr><th>Component</th><th>Bundle Formula</th><th>Bundles</th></tr></thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.id}>
                <td>{c.component}</td>
                <td className="text-left">{c.bundles.map((b) => `${b.bundle_no}: ${b.formula} = ${b.total}`).join(" | ")}</td>
                <td>{c.bundles.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-center font-semibold">TOTAL BUNDLES: {totalBundles}</div>
        <div className="mt-8 grid grid-cols-2 gap-6 text-xs">
          <div>Worker: {plan.cutting_no || "________"}<br />Date/Time: {plan.cutting_started_at ? new Date(plan.cutting_started_at).toLocaleString() : ""}<br /><br />_________________<br />Worker Signature</div>
          <div>_________________<br />Supervisor Signature</div>
        </div>
      </div>
    </div>
  );
}
