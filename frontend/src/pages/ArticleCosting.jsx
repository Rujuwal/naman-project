import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";
import { Button } from "@/components/ui/button";

const nowMonth = new Date().toISOString().slice(0, 7);
const rupees = (n) => n == null ? "—" : `₹${Number(n).toFixed(2)}`;

export default function ArticleCosting() {
  const [month, setMonth] = useState(nowMonth), [data, setData] = useState(null);
  useEffect(() => { api.get(`/costing/article-wise?month=${month}`).then(setData).catch(() => setData(null)); }, [month]);
  const download = () => { if (!data) return; const rows = [["Article", "Colour", "Good Pairs", "Material", "Cutting", "Printing", "Stitching", "Packaging", "Factory OH", "Actual Cost/Pair"], ...data.rows.map(r => [r.article, r.colour, r.good_pairs, r.material, r.cutting, r.printing, r.stitching, r.packaging, r.factory_overhead, r.actual_cost_per_pair])]; const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `article-cost-${month}.csv`; a.click(); URL.revokeObjectURL(a.href); };
  return <div data-testid="article-costing-page"><PageHeader title="Article-Wise Manufacturing Cost" subtitle="Actual cost per good pair by article and colour" actions={<><Button variant="outline" onClick={download}>Download Excel (CSV)</Button><Button variant="outline" onClick={() => window.print()}>Save PDF</Button></>} />
    <Card className="p-4 mb-5"><div className="flex items-center gap-3"><label className="text-sm font-medium">Production month</label><input className="border rounded px-2 py-1" type="month" value={month} onChange={e => setMonth(e.target.value)} /><span className="text-xs text-slate-500">Overhead allocation: Good pairs</span></div></Card>
    <Card className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>Article</th><th>Colour</th><th>Good Pairs</th><th>Material</th><th>Cutting</th><th>Printing</th><th>Stitching</th><th>Packaging</th><th>Factory OH</th><th>Actual Cost/Pair</th></tr></thead><tbody>{data?.rows.map(r => <tr key={`${r.article_id}-${r.colour_id}`}><td className="font-semibold">{r.article}</td><td>{r.colour}</td><td>{r.good_pairs}</td><td>{rupees(r.material)}</td><td>{rupees(r.cutting)}</td><td>{rupees(r.printing)}</td><td>{rupees(r.stitching)}</td><td>{rupees(r.packaging)}</td><td>{rupees(r.factory_overhead)}</td><td className="font-bold">{rupees(r.actual_cost_per_pair)}</td></tr>)}{!data?.rows?.length && <tr><td colSpan="10" className="text-center py-7 text-slate-500">No QC-passed production in this period.</td></tr>}</tbody></table></Card>
    {data && <p className="text-xs text-slate-500 mt-3">{data.data_note}</p>}
  </div>;
}
