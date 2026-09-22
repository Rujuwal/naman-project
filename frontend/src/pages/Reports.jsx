import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";

export default function Reports() {
  const [audits, setAudits] = useState([]);
  const [prod, setProd] = useState(null);

  useEffect(() => {
    api.get("/audit-logs?limit=50").then(setAudits);
    api.get("/reports/production-summary").then(setProd);
  }, []);

  return (
    <div data-testid="reports-page">
      <PageHeader title="Reports" subtitle="Production, quality, material & audit" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
