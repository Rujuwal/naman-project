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

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Factory Control Room" subtitle="Real-time operations overview" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Customer Orders" value={s.customer_orders} />
        <StatCard label="Active Plans" value={s.active_plans} />
        <StatCard label="Cutting Pending" value={s.cutting_pending} />
        <StatCard label="Printing Pending" value={s.printing_pending} />
        <StatCard label="Stitching Outside" value={s.stitching_outside} />
        <StatCard label="Stitching Return Pending" value={s.stitching_return_pending} />
        <StatCard label="QC Pending" value={s.qc_pending} />
        <StatCard label="Rework Pending" value={s.rework_pending} />
        <StatCard label="Finished Stock" value={s.finished_stock} />
        <StatCard label="Dispatch Pending" value={s.dispatch_pending} />
      </div>

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
