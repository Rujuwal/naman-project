import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Factory, Boxes, Truck, Users, BarChart3, Database, Settings, Menu, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customer-orders", label: "Customer Orders", icon: ShoppingCart },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/stock-room", label: "Stock Room", icon: Boxes },
  { to: "/dispatch", label: "Dispatch", icon: Truck },
  { to: "/fabricators", label: "Fabricators", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/masters", label: "Masters", icon: Database },
];

export default function Layout() {
  const [open, setOpen] = useState(true);
  const nav_ = useNavigate();
  const [q, setQ] = useState("");

  const onSearch = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    // Simple: try navigating to production filtered by query
    nav_(`/production?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen flex">
      <aside data-testid="sidebar" className={`sidebar ${open ? "w-64" : "w-16"} transition-all duration-200 flex-shrink-0 py-4 flex flex-col`}>
        <div className="px-4 pb-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded bg-blue-600 flex items-center justify-center text-white font-bold font-display">N</div>
            {open && (
              <div>
                <div className="font-display font-bold text-white text-lg leading-tight">NAMAN UPPER</div>
                <div className="text-xs text-slate-400">Manufacturing Control</div>
              </div>
            )}
          </div>
        </div>
        <nav className="mt-4 flex-1">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm font-medium ${isActive ? "active" : ""}`
              }>
              <n.icon size={18} />
              {open && <span>{n.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
          {open && <div>v1.0 • Factory OS</div>}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
          <button onClick={() => setOpen(!open)} data-testid="toggle-sidebar" className="p-1.5 hover:bg-slate-100 rounded">
            <Menu size={18} />
          </button>
          <form onSubmit={onSearch} className="flex-1 max-w-md">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plan, CO, article..." className="pl-9" data-testid="global-search" />
            </div>
          </form>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
