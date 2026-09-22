import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card, StatusBadge } from "@/components/Common";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { key: "ALL", label: "All Plans" },
  { key: "PLANNED", label: "Planned" },
  { key: "CUTTING", label: "Cutting" },
  { key: "PRINTING", label: "Printing" },
  { key: "STITCHING_OUT", label: "Stitching Out" },
  { key: "STITCHING_RETURN", label: "Stitching Return" },
  { key: "QC", label: "QC" },
  { key: "REWORK", label: "Rework" },
  { key: "FINISHED", label: "Finished Stock" },
];

export default function Production() {
  const [tab, setTab] = useState("ALL");
  const [plans, setPlans] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    const q = tab === "ALL" ? "" : `?status=${tab}`;
    api.get(`/plans${q}`).then(setPlans);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [tab]);

  const aName = (id) => articles.find((a) => a.id === id)?.code || "-";
  const colName = (id) => colours.find((c) => c.id === id)?.name || "-";

  const actionLabel = (s) => ({
    PLANNED: "Start Cutting", CUTTING: "Issue to Printing", PRINTING: "Issue to Fabricator",
    STITCHING_OUT: "Receive Stitching", QC: "Perform QC", REWORK: "Return to QC",
    FINISHED: "View", DISPATCHED: "View",
  }[s] || "View");

  return (
    <div data-testid="production-page">
      <PageHeader title="Production" subtitle="All production plans and stages" />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Card>
        <table className="data-table w-full">
          <thead><tr><th>Plan No.</th><th>Plan Date</th><th>CO</th><th>Article</th><th>Colour</th><th>Config</th><th>Qty</th><th>Stage</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {plans.length === 0 && <tr><td colSpan="10" className="text-center text-slate-500 py-8">No plans</td></tr>}
            {plans.map((p) => (
              <tr key={p.id} data-testid={`plan-row-${p.plan_no}`}>
                <td><Link to={`/production/${p.id}`} className="text-blue-600 font-mono">{p.plan_no}</Link></td>
                <td className="text-sm">{new Date(p.plan_date).toLocaleDateString()}</td>
                <td className="font-mono text-xs">{p.co_no}</td>
                <td>{aName(p.article_id)}</td>
                <td>{colName(p.colour_id)}</td>
                <td className="text-sm">{p.plan_config_name}</td>
                <td className="font-mono font-semibold">{p.qty}</td>
                <td>{p.current_stage}</td>
                <td><StatusBadge status={p.status} /></td>
                <td><Link to={`/production/${p.id}`} className="text-blue-600 text-sm font-semibold">{actionLabel(p.status)} →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
