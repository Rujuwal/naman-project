import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function PrintDispatch() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [articles, setArticles] = useState([]);
  const [colours, setColours] = useState([]);
  const [pcs, setPcs] = useState([]);

  useEffect(() => {
    api.get(`/dispatches/${id}`).then(setD);
    api.get("/customer-orders").then(setOrders);
    api.get("/customers").then(setCustomers);
    api.get("/articles").then(setArticles);
    api.get("/colours").then(setColours);
    api.get("/plan-configs").then(setPcs);
  }, [id]);
  if (!d) return null;
  const order = orders.find((o) => o.id === d.customer_order_id);
  const customer = customers.find((c) => c.id === order?.customer_id);
  const article = articles.find((a) => a.id === d.article_id);
  const colour = colours.find((c) => c.id === d.colour_id);
  const pc = pcs.find((p) => p.id === d.plan_config_id);
  const sizeCols = pc?.sizes?.map((s) => s.size) || [];

  return (
    <div>
      {d.status === "CANCELLED" && <div className="cancelled-watermark">CANCELLED</div>}
      <div className="no-print p-4 bg-slate-100 flex justify-end"><Button onClick={() => window.print()}><Printer size={14} className="mr-1" />Print</Button></div>
      <div className="print-page print-a4">
        <h1>DISPATCH SLIP</h1>
        <table className="mb-2"><tbody>
          <tr><td>Dispatch No.</td><td>{d.dispatch_no}</td><td>Date</td><td>{new Date(d.dispatch_date).toLocaleString()}</td></tr>
          <tr><td>Customer</td><td colSpan="3">{customer?.name || "-"}</td></tr>
          <tr><td>Order No.</td><td>{order?.co_no || "-"}</td><td>Article</td><td>{article?.code} - {article?.name}</td></tr>
          <tr><td>Colour</td><td>{colour?.name}</td><td>Configuration</td><td>{pc?.name}</td></tr>
        </tbody></table>
        <div className="text-xs font-semibold mb-1">PACKING LIST</div>
        <table className="mb-3">
          <thead><tr><th>Bag No.</th>{sizeCols.map((s) => <th key={s}>{s}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {d.bags.map((b, i) => (
              <tr key={i}><td>{b.bag_no}</td>{sizeCols.map((s) => <td key={s}>{b.sizes.find((x) => x.size === s)?.qty || 0}</td>)}<td>{b.total}</td></tr>
            ))}
            <tr><td><strong>Total</strong></td>{sizeCols.map((s) => <td key={s}><strong>{d.size_totals[s] || 0}</strong></td>)}<td><strong>{d.total_pairs}</strong></td></tr>
          </tbody>
        </table>
        <div className="text-center font-semibold text-sm mb-3">TOTAL BAGS: {d.total_bags} · TOTAL PAIRS: {d.total_pairs}</div>
        <table className="mb-3"><tbody>
          <tr><td>Transporter</td><td>{d.transporter || "-"}</td><td>Vehicle / LR</td><td>{d.vehicle_lr || "-"}</td></tr>
          <tr><td>Remarks</td><td colSpan="3">{d.remarks || "-"}</td></tr>
        </tbody></table>
        <div className="mt-6 grid grid-cols-2 gap-6 text-xs">
          <div>_________________<br />Dispatch Signature</div>
          <div>_________________<br />Receiver Signature</div>
        </div>
      </div>
    </div>
  );
}
