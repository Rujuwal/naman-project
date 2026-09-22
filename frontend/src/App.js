import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import CustomerOrders from "@/pages/CustomerOrders";
import CustomerOrderNew from "@/pages/CustomerOrderNew";
import CustomerOrderDetail from "@/pages/CustomerOrderDetail";
import Production from "@/pages/Production";
import PlanDetail from "@/pages/PlanDetail";
import StockRoom from "@/pages/StockRoom";
import Dispatch from "@/pages/Dispatch";
import DispatchNew from "@/pages/DispatchNew";
import Fabricators from "@/pages/Fabricators";
import Reports from "@/pages/Reports";
import Masters from "@/pages/Masters";
import PrintCutting from "@/pages/print/PrintCutting";
import PrintPrinting from "@/pages/print/PrintPrinting";
import PrintStitching from "@/pages/print/PrintStitching";
import PrintQC from "@/pages/print/PrintQC";
import PrintDispatch from "@/pages/print/PrintDispatch";
import { api } from "@/lib/api";

function App() {
  useEffect(() => {
    // Auto-seed on first load
    api.post("/seed").catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        {/* Print routes (no layout) */}
        <Route path="/print/cutting/:planId" element={<PrintCutting />} />
        <Route path="/print/printing/:planId" element={<PrintPrinting />} />
        <Route path="/print/stitching/:planId" element={<PrintStitching />} />
        <Route path="/print/qc/:qcId" element={<PrintQC />} />
        <Route path="/print/dispatch/:id" element={<PrintDispatch />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/customer-orders" element={<CustomerOrders />} />
          <Route path="/customer-orders/new" element={<CustomerOrderNew />} />
          <Route path="/customer-orders/:id" element={<CustomerOrderDetail />} />
          <Route path="/production" element={<Production />} />
          <Route path="/production/:id" element={<PlanDetail />} />
          <Route path="/stock-room" element={<StockRoom />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/dispatch/new" element={<DispatchNew />} />
          <Route path="/fabricators" element={<Fabricators />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/masters" element={<Masters />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
