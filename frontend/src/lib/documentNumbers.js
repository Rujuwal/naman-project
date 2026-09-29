// Keep document references short and consistent for both legacy and new data.
// Examples: CO-2026-0007 -> CO-0007, PLAN-2026-0012 -> P-0012.
export function formatCustomerOrderNo(value) {
  if (!value) return "-";
  const match = String(value).match(/(?:CO)[\/-]?(?:\d{4}[\/-])?(\d+)$/i);
  return match ? `CO-${match[1].padStart(4, "0")}` : value;
}

export function formatPlanNo(value) {
  if (!value) return "-";
  const match = String(value).match(/(?:PLAN|P)[\/-]?(?:\d{4}[\/-])?(\d+)$/i);
  return match ? `P-${match[1].padStart(4, "0")}` : value;
}
