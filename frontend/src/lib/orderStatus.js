export function customerOrderStatus(order, plans = []) {
  const required = (order.items || []).reduce((sum, item) => sum + (item.num_plans || 0), 0);
  const generated = (order.items || []).reduce((sum, item) => sum + (item.plans_generated || 0), 0);
  const statuses = plans.filter((plan) => plan.status !== "CANCELLED").map((plan) => plan.status);

  if (!statuses.length) return required ? "PENDING PLANNING" : "OPEN";
  if (generated < required) return "PENDING PLANNING";
  if (statuses.includes("REWORK")) return "REWORK";
  if (statuses.some((status) => ["QC", "HOLD"].includes(status))) return "QC PENDING";
  if (statuses.some((status) => ["CUTTING", "PRINTING", "STITCHING_OUT", "STITCHING_RETURN"].includes(status))) return "IN PRODUCTION";
  if (statuses.includes("PLANNED")) return "PLANNED";
  if (statuses.includes("FINISHED")) return "READY TO DISPATCH";
  if (statuses.every((status) => status === "DISPATCHED")) return "COMPLETED";
  return order.status || "OPEN";
}
