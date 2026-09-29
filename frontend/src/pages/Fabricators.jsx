import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card, StatCard, StatusBadge } from "@/components/Common";
import { Button } from "@/components/ui/button";

const metric = (value, suffix = "") => value == null ? "—" : `${value}${suffix}`;

export default function Fabricators() {
  const [fabricators, setFabricators] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const basicManagement = async () => {
      const [fabs, plans] = await Promise.all([api.get("/fabricators"), api.get("/plans")]);
      return fabs.map((fabricator) => {
        const fabPlans = plans.filter((plan) => plan.fabricator_id === fabricator.id);
        const outside = fabPlans.filter((plan) => plan.status === "STITCHING_OUT");
        const issued = fabPlans.reduce((sum, plan) => sum + (plan.qty || 0), 0);
        const pending = outside.reduce((sum, plan) => sum + (plan.qty || 0), 0);
        return {
          ...fabricator, current_work: outside.length, plans_issued: fabPlans.length,
          pairs_issued: issued, returns: 0, pairs_returned: 0, pending_pairs: pending,
          overdue_plans: 0, turnaround_days: null, daily_capacity: null,
          historical_production: 0, rework_pairs: 0, held_pairs: 0, quality_issues: 0,
          ledger: fabPlans.map((plan) => ({
            job_id: plan.id, plan_id: plan.id, plan_no: plan.plan_no,
            issue_date: plan.stitching_started_at, due_date: plan.due_date,
            return_date: null, pairs_issued: plan.qty, pairs_returned: 0,
            pending_pairs: plan.status === "STITCHING_OUT" ? plan.qty : 0,
            turnaround_days: null, status: plan.status,
          })),
        };
      });
    };

    api.get("/fabricators/management").catch(basicManagement).then((data) => {
      setFabricators(data);
      setSelectedId(data[0]?.id || null);
    });
  }, []);

  const selected = fabricators.find((fabricator) => fabricator.id === selectedId);
  const totalOutside = fabricators.reduce((sum, fabricator) => sum + (fabricator.pending_pairs || 0), 0);
  const totalOverdue = fabricators.reduce((sum, fabricator) => sum + (fabricator.overdue_plans || 0), 0);

  return (
    <div data-testid="fabricators-page">
      <PageHeader title="Fabricator Management" subtitle="Workload, quality, performance and job ledger" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Fabricators" value={fabricators.filter((fabricator) => fabricator.active).length} />
        <StatCard label="Pairs Outside" value={totalOutside} />
        <StatCard label="Overdue Jobs" value={totalOverdue} />
        <StatCard label="Returns Recorded" value={fabricators.reduce((sum, fabricator) => sum + (fabricator.returns || 0), 0)} />
      </div>

      <Card className="p-4 mb-6" data-testid="fabricator-workload">
        <div className="font-display font-semibold mb-3">Fabricator Workload</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {fabricators.map((fabricator) => (
            <button key={fabricator.id} onClick={() => setSelectedId(fabricator.id)} className={`text-left rounded-lg border p-4 transition-colors ${selectedId === fabricator.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`} data-testid={`fabricator-workload-${fabricator.id}`}>
              <div className="font-semibold">{fabricator.name}</div><div className="font-mono text-2xl font-bold mt-2">{fabricator.pending_pairs}</div>
              <div className="text-xs text-slate-500 uppercase">pairs outside · {fabricator.current_work} active plan(s)</div>
              {fabricator.overdue_plans > 0 && <div className="text-xs text-red-700 font-semibold mt-2">{fabricator.overdue_plans} overdue plan(s)</div>}
            </button>
          ))}
          {fabricators.length === 0 && <div className="text-sm text-slate-500">No fabricators configured.</div>}
        </div>
      </Card>

      <Card className="overflow-x-auto mb-6"><table className="data-table w-full" data-testid="fabricator-performance-table">
        <thead><tr><th>Fabricator</th><th>Current Work</th><th>Plans Issued</th><th>Pairs Issued</th><th>Returns</th><th>Pending</th><th>Overdue</th><th>Turnaround</th><th>Daily Capacity</th><th>Rework</th><th>Quality Issues</th><th></th></tr></thead>
        <tbody>{fabricators.map((fabricator) => <tr key={fabricator.id}>
          <td><div className="font-semibold">{fabricator.name}</div><div className="text-xs text-slate-500">{fabricator.phone || "No phone"}</div></td><td>{fabricator.current_work} plan(s)</td><td>{fabricator.plans_issued}</td><td className="font-mono">{fabricator.pairs_issued}</td><td className="font-mono">{fabricator.pairs_returned}</td><td className="font-mono font-semibold">{fabricator.pending_pairs}</td><td className={fabricator.overdue_plans ? "text-red-700 font-semibold" : ""}>{fabricator.overdue_plans}</td><td>{metric(fabricator.turnaround_days, " days")}</td><td>{metric(fabricator.daily_capacity, " pairs/day")}</td><td>{fabricator.rework_pairs}</td><td>{fabricator.quality_issues}</td><td><Button size="sm" variant="outline" onClick={() => setSelectedId(fabricator.id)}>Ledger</Button></td>
        </tr>)}{fabricators.length === 0 && <tr><td colSpan="12" className="text-center text-slate-500 py-6">No fabricators configured.</td></tr>}</tbody>
      </table></Card>

      {selected && <Card className="p-4" data-testid="fabricator-ledger">
        <div className="flex items-center justify-between mb-1"><div className="font-display font-semibold">{selected.name} — Job Ledger & Performance History</div><div className="text-sm text-slate-500">Historical production: <span className="font-mono font-semibold">{selected.historical_production}</span> pairs</div></div>
        <div className="text-sm text-slate-500 mb-3">Average turnaround: {metric(selected.turnaround_days, " days")} · Rework: {selected.rework_pairs} · Held: {selected.held_pairs}</div>
        <div className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>Plan</th><th>Issued</th><th>Due</th><th>Returned</th><th>Pairs Issued</th><th>Pairs Returned</th><th>Pending</th><th>Turnaround</th><th>Status</th></tr></thead><tbody>
          {selected.ledger.map((job) => <tr key={job.job_id}><td><Link to={`/production/${job.plan_id}`} className="text-blue-600 font-mono">{job.plan_no}</Link></td><td>{job.issue_date ? new Date(job.issue_date).toLocaleDateString() : "—"}</td><td>{job.due_date ? new Date(job.due_date).toLocaleDateString() : "—"}</td><td>{job.return_date ? new Date(job.return_date).toLocaleDateString() : "—"}</td><td>{job.pairs_issued}</td><td>{job.pairs_returned}</td><td>{job.pending_pairs}</td><td>{metric(job.turnaround_days, " days")}</td><td><StatusBadge status={job.status} /></td></tr>)}
          {selected.ledger.length === 0 && <tr><td colSpan="9" className="text-center text-slate-500 py-6">No issued jobs yet.</td></tr>}
        </tbody></table></div>
      </Card>}
    </div>
  );
}
