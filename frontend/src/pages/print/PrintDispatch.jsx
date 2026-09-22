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
  const [pcs, setPcs] = useState([]);

  useEffect(() => {
    api.get(`/dispatches/${id}`).then(setD);
    api.get("/customers").then(setCustomers);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
    api.get("/plan-configs").then(setPcs);
  }, [id]);
  if (!d) return null;
  const customer = customers.find((c) => c.id === d.customer_id);
  const aName = (id) => articles.find((a) => a.id === id)?.code || "-";
  const cName = (id) => colours.find((c) => c.id === id)?.name || "-";
  const pcName = (id) => pcs.find((p) => p.id === id)?.name || "-";

  // Group bags by plan_id
  const byPlan = {};
  d.bags.forEach((b) => { (byPlan[b.plan_id] ||= { plan_no: b.plan_no, article_id: b.article_id, colour_id: b.colour_id, plan_config_id: b.plan_config_id, bags: [] }).bags.push(b); });
  const planGroups = Object.values(byPlan);

  const allSizesForGroup = (g) => {
    const set = new Set();
    g.bags.forEach((b) => b.sizes.forEach((s) => set.add(s.size)));
    // preserve order from plan_config if available
    const pc = pcs.find((p) => p.id === g.plan_config_id);
    if (pc) return pc.sizes.map((s) => s.size).filter((s) => set.has(s));
    return Array.from(set);
  };

  return (
    <div>
      {d.status === "CANCELLED" && <div className="cancelled-watermark">CANCELLED</div>}
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()}><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page print-a4">
        <PrintHeader title="Dispatch Slip" subtitle={d.dispatch_no} />
        <div className="doc-meta">
          <div><span className="lbl">Dispatch No.</span><span className="val">{d.dispatch_no}</span></div>
          <div><span className="lbl">Date</span><span className="val">{new Date(d.dispatch_date).toLocaleDateString()}</span></div>
          <div><span className="lbl">Customer</span><span className="val">{customer?.name || "-"}</span></div>
          <div><span className="lbl">Customer PO No.</span><span className="val">{(d.customer_pos && d.customer_pos.length) ? d.customer_pos.join(", ") : "-"}</span></div>
          <div><span className="lbl">Order No(s).</span><span className="val">{(d.co_nos || []).join(", ") || "-"}</span></div>
          <div><span className="lbl">Plans</span><span className="val">{planGroups.length}</span></div>
          <div><span className="lbl">Transporter</span><span className="val">{d.transporter || "-"}</span></div>
          <div><span className="lbl">Vehicle / LR</span><span className="val">{d.vehicle_lr || "-"}</span></div>
        </div>

        <div className="totals-strip">
          <div><div className="k">Total Plans</div><div className="v">{planGroups.length}</div></div>
          <div><div className="k">Total Bags</div><div className="v">{d.total_bags}</div></div>
          <div><div className="k">Total Pairs</div><div className="v">{d.total_pairs}</div></div>
        </div>

        {planGroups.map((g) => {
          const sizes = allSizesForGroup(g);
          const totals = sizes.map((s) => g.bags.reduce((a, b) => a + (b.sizes.find((x) => x.size === s)?.qty || 0), 0));
          const groupTotal = g.bags.reduce((a, b) => a + b.total, 0);
          return (
            <div className="plan-block" key={g.plan_no}>
              <h4>
                <span>Plan {g.plan_no}</span>
                <span style={{fontSize: 11, color: '#64748b'}}>{aName(g.article_id)} · {cName(g.colour_id)} · {pcName(g.plan_config_id)}</span>
              </h4>
              <div className="plan-meta">
                <span>Bags: {g.bags.length}</span>
                <span>Pairs: {groupTotal}</span>
              </div>
              <table>
                <thead><tr><th>Bag No.</th>{sizes.map((s) => <th key={s}>{s}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {g.bags.map((b, i) => <tr key={i}><td>{b.bag_no}</td>{sizes.map((s) => <td key={s}>{b.sizes.find((x) => x.size === s)?.qty || 0}</td>)}<td>{b.total}</td></tr>)}
                  <tr className="total-row"><td>Total</td>{totals.map((t, i) => <td key={i}>{t}</td>)}<td>{groupTotal}</td></tr>
                </tbody>
              </table>
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
