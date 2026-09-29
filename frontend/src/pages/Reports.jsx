import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";
import { Button } from "@/components/ui/button";

export default function Reports() {
  const [audits, setAudits] = useState([]);
  const [prod, setProd] = useState(null);
  const [costing, setCosting] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthly, setMonthly] = useState(null);

  useEffect(() => {
    api.get("/audit-logs?limit=50").then(setAudits);
    api.get("/reports/production-summary").then(setProd);
    api.get("/costing/control-center").then(setCosting).catch(() => setCosting(null));
  }, []);
  useEffect(() => { api.get(`/reports/monthly-cost-analysis?month=${month}`).then(setMonthly).catch(() => setMonthly(null)); }, [month]);

  return (
    <div data-testid="reports-page">
      <PageHeader title="Reports" subtitle="Production, quality, material & audit" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4 lg:col-span-2" data-testid="monthly-cost-analysis">
          <div className="flex flex-wrap justify-between gap-3 items-center mb-3"><div><div className="font-display font-semibold">Monthly Cost Analysis</div><div className="text-xs text-slate-500">Actual cost uses QC-passed good pairs, not order or dispatch quantity.</div></div><div className="flex gap-2"><input className="border rounded px-2" type="month" value={month} onChange={e => setMonth(e.target.value)} /><Button size="sm" variant="outline" onClick={() => window.print()}>Save PDF</Button></div></div>
          {!monthly && <div className="text-sm text-slate-500">Monthly costing is available after the accounting service is deployed.</div>}
          {monthly && <><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><div><div className="text-xs text-slate-500">Good pairs</div><div className="text-xl font-bold">{monthly.good_pairs}</div></div><div><div className="text-xs text-slate-500">Manufacturing cost</div><div className="text-xl font-bold">₹{monthly.total_cost.toFixed(2)}</div></div><div><div className="text-xs text-slate-500">Actual cost / good pair</div><div className="text-xl font-bold">{monthly.cost_per_pair == null ? "—" : `₹${monthly.cost_per_pair.toFixed(2)}`}</div></div><div><div className="text-xs text-slate-500">Period</div><div className="text-sm font-semibold">{monthly.from} to {monthly.to}</div></div></div><table className="data-table w-full"><thead><tr><th>Cost head</th><th>Total cost</th><th>Cost / pair</th><th>% of total</th></tr></thead><tbody>{monthly.breakdown.map(r => <tr key={r.head}><td>{r.head}</td><td>₹{r.total.toFixed(2)}</td><td>{r.cost_per_pair == null ? "—" : `₹${r.cost_per_pair.toFixed(2)}`}</td><td>{r.percent}%</td></tr>)}<tr className="font-bold"><td>Total</td><td>₹{monthly.total_cost.toFixed(2)}</td><td>{monthly.cost_per_pair == null ? "—" : `₹${monthly.cost_per_pair.toFixed(2)}`}</td><td>100%</td></tr></tbody></table><div className="text-xs text-slate-500 mt-3">{monthly.data_note}</div></>}
        </Card>
        <Card className="p-4 lg:col-span-2" data-testid="cost-control-center">
          <div className="flex justify-between items-center mb-3"><div className="font-display font-semibold">Cost Control Center</div><div className="text-sm text-slate-500">Rated materials: {costing?.rated_materials ?? "—"}</div></div>
          {!costing && <div className="text-sm text-slate-500">Costing data becomes available after material rates are entered.</div>}
          {costing && <table className="data-table w-full"><thead><tr><th>Article</th><th>Colour</th><th>Plans</th><th>Standard Material / Pair</th><th>Actual Material / Pair</th><th>Variance</th></tr></thead><tbody>{costing.article_costs.length === 0 && <tr><td colSpan="6" className="text-center text-slate-500 py-4">No BOM-based costing available yet.</td></tr>}{costing.article_costs.map((row, i) => <tr key={i}><td>{row.article}</td><td>{row.colour}</td><td>{row.plans}</td><td>₹{row.standard.toFixed(2)}</td><td>{row.actual == null ? "—" : `₹${row.actual.toFixed(2)}`}</td><td className={row.variance > 0 ? "text-red-700 font-semibold" : ""}>{row.variance == null ? "—" : `₹${row.variance.toFixed(2)}`}</td></tr>)}</tbody></table>}
        </Card>
        <Card className="p-4">
          <div className="font-display font-semibold mb-3">Production Summary</div>
          <div className="text-3xl font-display font-bold">{prod?.total_plans || 0}</div>
          <div className="text-sm text-slate-500">Total plans</div>
        </Card>
        <Card className="p-4">
          <div className="font-display font-semibold mb-3">Audit Trail (recent)</div>
          <div className="max-h-96 overflow-auto space-y-1">
            {audits.map((a) => (
              <div key={a.id} className="text-xs border-b py-1">
                <span className="font-mono text-slate-500">{new Date(a.at).toLocaleString()}</span>
                <span className="ml-2 font-semibold">{a.action}</span> · <span>{a.entity}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
