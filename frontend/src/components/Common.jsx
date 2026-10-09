import React from "react";

export const StatusBadge = ({ status }) => {
  const key = (status || "").toLowerCase();
  return <span data-testid={`status-${key}`} className={`status-badge badge-${key}`}>{status}</span>;
};

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex items-center justify-between mb-6">
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    <div className="flex items-center gap-2">{actions}</div>
  </div>
);

export const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

export const StatCard = ({ label, value, subtext, tone = "slate" }) => (
  <div className={`bg-white rounded-lg border border-slate-200 p-4`}>
    <div className="text-xs text-slate-500 uppercase font-semibold tracking-wide">{label}</div>
    <div className={`font-display text-3xl font-bold text-${tone}-900 mt-1`}>{value}</div>
    {subtext && <div className="text-xs text-slate-500 mt-1">{subtext}</div>}
  </div>
);
