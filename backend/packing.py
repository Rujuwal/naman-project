"""Physical packing totals; composition rows are never physical bag identifiers."""
from fastapi import HTTPException


def packing_summary(rows, rule):
    size_totals = {size: 0 for size in rule}
    row_totals = []
    for row in rows:
        seen = set()
        total = 0
        for cell in row["sizes"]:
            size, qty = cell["size"], cell["qty"]
            if size not in rule:
                raise HTTPException(400, f"Unknown packing size: {size}")
            if size in seen:
                raise HTTPException(400, f"Duplicate packing size: {size}")
            if isinstance(qty, bool) or not isinstance(qty, int) or qty < 0:
                raise HTTPException(400, "Packing quantities must be non-negative whole pairs")
            seen.add(size)
            size_totals[size] += qty
            total += qty
        row_totals.append(total)
    total_pairs = sum(row_totals)
    if total_pairs != sum(size_totals.values()):
        raise HTTPException(400, "Packing row and size totals do not reconcile")
    missing = [size for size, capacity in rule.items() if not isinstance(capacity, int) or isinstance(capacity, bool) or capacity <= 0]
    bags_by_size = {} if missing else {size: (qty + rule[size] - 1) // rule[size] for size, qty in size_totals.items()}
    return {
        "packing_row_count": len(rows),
        "row_totals": row_totals,
        "size_order": list(rule),
        "size_totals": size_totals,
        "total_pairs": total_pairs,
        "total_bags": None if missing else sum(bags_by_size.values()),
        "bags_by_size": bags_by_size,
        "partial_pairs_by_size": {} if missing else {size: qty % rule[size] for size, qty in size_totals.items() if qty % rule[size]},
        "packing_rule_snapshot": rule,
        "packing_error": f"Set Pairs Per Bag in Masters > Plan Configs for sizes {', '.join(missing)}" if missing else None,
    }
