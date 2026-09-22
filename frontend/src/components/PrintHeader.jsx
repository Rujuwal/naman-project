import React from "react";

export default function PrintHeader({ title, subtitle }) {
  return (
    <div className="print-header" data-testid="print-header">
      <div className="print-brand">
        <div className="print-brand-mark">N</div>
        <div>
          <div className="print-brand-name">NAMAN UPPER</div>
          <div className="print-brand-tag">Upper Manufacturing Control System</div>
        </div>
      </div>
      <div className="print-title-block">
        <div className="print-title">{title}</div>
        {subtitle && <div className="print-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}
