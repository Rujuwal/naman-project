import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, StatCard, Card } from "@/components/Common";
import { StatusBadge } from "@/components/Common";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then(setData);
  }, []);

  if (!data) return <div>Loading...</div>;
  const s = data.stats;
  const c = data.command_center || {};

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Command Center" subtitle="Factory health at a glance" />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6" data-testid="command-center-metrics">
        <StatCard label="Today's Production" value={c.today_production ?? 0} />
        <StatCard label="Today's Dispatch" value={c.today_dispatch ?? 0} />
        <StatCard label="Pending Orders" value={c.pending_orders ?? 0} />
        <StatCard label="WIP (Pairs)" value={c.wip_pairs ?? 0} />
        <StatCard label="Bottleneck" value={c.bottleneck?.plans ? `${c.bottleneck.stage} (${c.bottleneck.plans})` : "—"} />
        <StatCard label="Overdue Plans" value={c.overdue_plans ?? 0} />
        <StatCard label="Material Shortages" value={c.material_shortages ?? 0} />
        <StatCard label="QC Pending" value={c.qc_pending ?? 0} />
        <StatCard label="Machine Downtime" value={c.machine_downtime_minutes == null ? "—" : `${c.machine_downtime_minutes}m`} />
        <StatCard label="Production Efficiency" value={c.production_efficiency == null ? "—" : `${c.production_efficiency}%`} />
        <StatCard label="Cost / Pair" value={c.cost_per_pair == null ? "—" : c.cost_per_pair} />
        <StatCard label="On-time Delivery" value={c.on_time_delivery == null ? "—" : `${c.on_time_delivery}%`} />
      </div>

      <Card className="p-4 mb-6 border-amber-300 bg-amber-50" data-testid="action-required">
        <div className="font-display font-semibold text-amber-950 mb-1">Action Required</div>
        <p className="text-sm text-amber-900 mb-3">Items that need management attention now.</p>
        {data.action_required?.length === 0 && <div className="text-sm text-slate-600">No critical actions at this time.</div>}
        <div className="space-y-2">
          {(data.action_required || []).map((action, index) => {
            const content = <><span className={`inline-block w-2 h-2 rounded-full mr-2 ${action.severity === "critical" ? "bg-red-600" : action.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} /><span className="font-semibold">{action.title}</span><span className="text-sm text-slate-600 ml-2">{action.detail}</span></>;
            return action.plan_id
              ? <Link key={`${action.kind}-${index}`} to={`/production/${action.plan_id}`} className="block rounded bg-white/80 px-3 py-2 hover:bg-white">{content}</Link>
              : <div key={`${action.kind}-${index}`} className="rounded bg-white/80 px-3 py-2">{content}</div>;
          })}
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <div className="font-display font-semibold mb-3">Production Flow</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {["CUSTOMER ORDERS", "PLANNED", "CUTTING", "PRINTING", "STITCHING OUT", "STITCHING RETURN", "QC", "FINISHED STOCK", "DISPATCH"].map((s, i, a) => (
            <React.Fragment key={s}>
              <span className="px-3 py-1.5 bg-slate-100 rounded font-mono">{s}</span>
              {i < a.length - 1 && <span className="text-slate-400">→</span>}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <div className="font-display font-semibold mb-3">Active Production</div>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead><tr><th>Plan</th><th>CO</th><th>Qty</th><th>Stage</th><th>Status</th></tr></thead>
              <tbody>
                {data.active_plans.length === 0 && <tr><td colSpan="5" className="text-center text-slate-500 py-4">No active plans</td></tr>}
                {data.active_plans.slice(0, 8).map((p) => (
                  <tr key={p.id} data-testid={`dash-plan-${p.plan_no}`}>
                    <td><Link to={`/production/${p.id}`} className="text-blue-600 font-mono">{p.plan_no}</Link></td>
                    <td className="font-mono text-xs">{p.co_no}</td>
                    <td>{p.qty}</td>
                    <td>{p.current_stage}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-display font-semibold mb-3">Fabricator Watch</div>
          <table className="data-table w-full">
            <thead><tr><th>Fabricator</th><th>Plans Outside</th><th>Qty Outside</th></tr></thead>
            <tbody>
              {data.fabricator_watch.length === 0 && <tr><td colSpan="3" className="text-center text-slate-500 py-4">No plans outside</td></tr>}
              {data.fabricator_watch.map((f, i) => (
                <tr key={i}><td>{f.fabricator_name}</td><td>{f.plans_outside}</td><td>{f.qty_outside}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <div className="font-display font-semibold mb-3">Material Requirement</div>
          <table className="data-table w-full">
            <thead><tr><th>Material</th><th>Required</th><th>Current</th><th>Shortage</th></tr></thead>
            <tbody>
              {data.material_requirement.length === 0 && <tr><td colSpan="4" className="text-center text-slate-500 py-4">No shortages</td></tr>}
              {data.material_requirement.map((m) => (
                <tr key={m.material_id}>
                  <td>{m.material_name}</td><td>{m.required}</td><td>{m.current}</td>
                  <td className="text-red-600 font-semibold">{m.shortage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <div className="font-display font-semibold mb-3">Recent Activity</div>
          <div className="space-y-2 max-h-96 overflow-auto">
            {data.recent_activity.map((a) => (
              <div key={a.id} className="text-sm border-b border-slate-100 pb-1.5">
                <span className="font-mono text-xs text-slate-500">{new Date(a.at).toLocaleString()}</span>
                <span className="ml-2">{a.action} · <span className="text-slate-500">{a.entity}</span></span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
