import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import PrintHeader from "@/components/PrintHeader";

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
  const ret = plan.returns?.[plan.returns.length - 1];
  const rows = ret ? ret.bags : Array.from({ length: 8 }, () => null);

  return (
    <div>
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()} data-testid="print-trigger-button"><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page" data-testid="print-slip-container">
        <PrintHeader title="Stitching Job Card" subtitle="Fabricator Work Order" />
        <div className="doc-meta">
          <div><span className="lbl">Stitching No.</span><span className="val">{plan.stitching_no || "-"}</span></div>
          <div><span className="lbl">Plan No.</span><span className="val">{plan.plan_no}</span></div>
          <div><span className="lbl">Fabricator</span><span className="val">{plan.fabricator_name || "-"}</span></div>
          <div><span className="lbl">Issue Date</span><span className="val">{plan.stitching_started_at ? new Date(plan.stitching_started_at).toLocaleDateString() : "-"}</span></div>
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

        <div className="section-title">Component / Bundles</div>
        <table>
          <thead><tr><th style={{width: '25%'}}>Component</th><th>Bundle Formula</th><th style={{width: '15%'}}>Bundles</th></tr></thead>
          <tbody>{comps.map((c) => <tr key={c.id}><td>{c.component}</td><td style={{textAlign: 'left'}}>{c.bundles.map((b) => `${b.bundle_no}: ${b.formula} = ${b.total}`).join(" | ")}</td><td>{c.bundles.length}</td></tr>)}</tbody>
        </table>

        <div className="section-title">{ret ? "Stitching Return Packing List" : "Packing / Return (fill on return)"}</div>
        <table data-testid="stitching-packing-table">
          <thead><tr><th>S. No.</th>{plan.sizes_snapshot.map((s) => <th key={s.size}>{s.size}</th>)}<th>Total</th>{!ret && <><th>Good</th><th>Rework</th><th>Reject</th></>}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i} data-testid={`stitching-packing-row-${i + 1}`}><td>{i + 1}</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{row ? row.sizes.find((x) => x.size === s.size)?.qty || 0 : "\u00a0"}</td>)}<td>{row?.total ?? "\u00a0"}</td>{!ret && <><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></>}</tr>)}
            {ret && <tr className="total-row"><td>Total</td>{plan.sizes_snapshot.map((s) => <td key={s.size}>{ret.size_totals[s.size]}</td>)}<td>{ret.total_pairs}</td></tr>}
          </tbody>
        </table>
        {ret && <div className="totals-strip"><div><div className="k">Total Bags</div><div className="v" data-testid="stitching-total-bags">{ret.total_bags ?? "Not configured"}</div></div><div><div className="k">Total Pairs</div><div className="v" data-testid="stitching-total-pairs">{ret.total_pairs}</div></div></div>}

        <div className="sign-block">
          <div><div className="sign-line">Fabricator Signature</div></div>
          <div><div className="sign-line">Supervisor Signature</div></div>
        </div>
      </div>
    </div>
  );
}
