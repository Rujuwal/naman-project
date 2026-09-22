import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import PrintHeader from "@/components/PrintHeader";

export default function PrintDispatch() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);

  useEffect(() => {
    api.get(`/dispatches/${id}`).then(setD);
    api.get("/customers").then(setCustomers);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
  }, [id]);
  if (!d) return null;
  const customer = customers.find((c) => c.id === d.customer_id);
  const aName = (id) => articles.find((a) => a.id === id)?.code || "-";
  const cName = (id) => colours.find((c) => c.id === id)?.name || "-";
  const planGroups = d.packing_groups || [];

  return (
    <div>
      {d.status === "CANCELLED" && <div className="cancelled-watermark">CANCELLED</div>}
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()} data-testid="print-trigger-button"><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page" data-testid="print-slip-container">
        <PrintHeader title="Dispatch Slip" subtitle={d.dispatch_no} />
        <div className="doc-meta">
          <div><span className="lbl">Dispatch No.</span><span className="val">{d.dispatch_no}</span></div>
          <div><span className="lbl">Date</span><span className="val" data-testid="print-dispatch-date">{new Date(d.dispatch_date).toLocaleDateString()}</span></div>
          <div><span className="lbl">Customer</span><span className="val">{customer?.name || "-"}</span></div>
          <div><span className="lbl">Customer PO No.</span><span className="val">{(d.customer_pos && d.customer_pos.length) ? d.customer_pos.join(", ") : "-"}</span></div>
          <div><span className="lbl">Order No(s).</span><span className="val">{(d.co_nos || []).join(", ") || "-"}</span></div>
          <div><span className="lbl">Plans</span><span className="val">{planGroups.length}</span></div>
          <div><span className="lbl">Transporter</span><span className="val">{d.transporter || "-"}</span></div>
          <div><span className="lbl">Vehicle / LR</span><span className="val">{d.vehicle_lr || "-"}</span></div>
        </div>

        <div className="totals-strip">
          <div><div className="k">Total Plans</div><div className="v" data-testid="print-total-plans">{d.plan_ids.length}</div></div>
          <div><div className="k">Total Bags</div><div className="v" data-testid="print-total-bags">{d.total_bags ?? "Not configured"}</div></div>
          <div><div className="k">Total Pairs</div><div className="v" data-testid="print-total-pairs">{d.total_pairs}</div></div>
        </div>
        {d.packing_error && <div className="packing-rule-note" data-testid="print-packing-error">{d.packing_error}</div>}

        {planGroups.map((g) => {
          const sizes = g.size_order;
          return (
            <div className="plan-block" key={g.return_id} data-testid={`print-packing-group-${g.plan_id}`}>
              <h4>
                <span data-testid={`print-plan-${g.plan_id}`}>Plan {g.plan_no}</span>
                <span style={{fontSize: 11, color: '#64748b'}}>{aName(g.article_id)} · {cName(g.colour_id)} · {g.plan_config_name}</span>
              </h4>
              <div className="plan-meta">
                <span data-testid={`print-group-bags-${g.plan_id}`}>Total Bags: {g.total_bags ?? "Not configured"}</span>
                <span data-testid={`print-group-pairs-${g.plan_id}`}>Total Pairs: {g.total_pairs}</span>
              </div>
              <table data-testid={`print-packing-table-${g.plan_id}`}>
                <thead><tr><th>S. No.</th>{sizes.map((s) => <th key={s}>{s}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {g.bags.map((b, i) => <tr key={i} data-testid={`print-packing-row-${g.plan_id}-${i + 1}`}><td>{i + 1}</td>{sizes.map((s) => <td key={s}>{b.sizes.find((x) => x.size === s)?.qty || 0}</td>)}<td>{b.total}</td></tr>)}
                  <tr className="total-row"><td>Total</td>{sizes.map((s) => <td key={s}>{g.size_totals[s]}</td>)}<td>{g.total_pairs}</td></tr>
                </tbody>
              </table>
              <div className="packing-rule-note" data-testid={`print-packing-rule-${g.plan_id}`}>Pairs per bag: {Object.entries(g.packing_rule_snapshot).map(([size, qty]) => `${size}: ${qty ?? "Not set"}`).join(" · ")}</div>
            </div>
          );
        })}

        {d.remarks && <div style={{fontSize: 11, marginTop: 8}}><strong>Remarks:</strong> {d.remarks}</div>}

        <div className="sign-block">
          <div><div className="sign-line">Dispatch Signature</div></div>
          <div><div className="sign-line">Receiver Signature</div></div>
        </div>
      </div>
    </div>
  );
}
