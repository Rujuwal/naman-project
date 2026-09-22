import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

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
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()}><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page">
        <h1>PRINTING ORDER</h1>
        <table className="mb-2"><tbody>
          <tr><td>Printing No.</td><td>{plan.printing_no || "-"}</td><td>Plan No.</td><td>{plan.plan_no}</td></tr>
          <tr><td>Issue Date</td><td>{plan.printing_started_at ? new Date(plan.printing_started_at).toLocaleDateString() : "-"}</td><td>Issue Time</td><td>{plan.printing_started_at ? new Date(plan.printing_started_at).toLocaleTimeString() : "-"}</td></tr>
          <tr><td>Article</td><td>{article?.code}</td><td>Colour</td><td>{colour?.name}</td></tr>
          <tr><td>Configuration</td><td colSpan="3">{plan.plan_config_name}</td></tr>
        </tbody></table>
        <div className="text-xs font-semibold mb-1">SIZE BREAKUP</div>
        <table className="mb-3">
          <thead><tr><th>Size</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th></tr></thead>
          <tbody><tr><td>Pairs</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{s.pairs}</td>)}<td><strong>{plan.qty}</strong></td></tr></tbody>
        </table>
        <div className="text-xs font-semibold mb-1">PRINTING DETAILS</div>
        <table className="mb-3"><tbody>
          <tr><td>Artwork / Printing</td><td>__________________</td></tr>
          <tr><td>Printing Colour</td><td>__________________</td></tr>
          <tr><td>Special Instructions</td><td>__________________</td></tr>
        </tbody></table>
        <div className="mt-8 grid grid-cols-2 gap-6 text-xs">
          <div>_________________<br />Worker Signature</div>
          <div>_________________<br />Supervisor Signature</div>
        </div>
      </div>
    </div>
  );
}
