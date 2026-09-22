#!/usr/bin/env python3
"""Create end-to-end test data: customer order -> plans -> cutting -> ... -> Finished.
Produces at least 2 FINISHED plans for Yashvi Enterprises so that dispatch redesign
and cancel-plan flows can be tested via the UI.
"""
import os, sys, json, requests, time

BE = os.environ.get("REACT_APP_BACKEND_URL", "https://naman-upper-system.preview.emergentagent.com").rstrip("/")

def _p(r):
    if r.status_code >= 300:
        print("ERR", r.status_code, r.text[:400]); sys.exit(1)
    return r.json()

YASHVI = "65a0c386-84ed-409a-b116-f09a3aad4d99"
ARTICLE_04 = "97416734-1dbd-4fc9-84fa-475ef28dd892"
ARTICLE_02 = "c09eebd2-498c-4e55-94f6-0a9c4fc6ecb4"
PC_KIDS = "f4aa71b5-8e13-43c1-ba1a-6f939ffb8840"   # small = 600 pairs/plan
COLOUR_BLACK = "6ef23115-e07b-404b-8adf-af9e58dc83c9"
COLOUR_WHITE = "9d97c414-1ac5-4658-b044-0d2ae80b6e6e"
FAB = "6f68e3ec-8799-42b8-ab34-e97435186b19"

def create_co():
    body = {
        "customer_id": YASHVI,
        "delivery_date": "2026-03-31",
        "priority": "High",
        "customer_po": "PO-TEST-001",
        "remarks": "seed for e2e",
        "items": [
            {"article_id": ARTICLE_04, "colour_id": COLOUR_BLACK, "plan_config_id": PC_KIDS, "num_plans": 2},
            {"article_id": ARTICLE_02, "colour_id": COLOUR_WHITE, "plan_config_id": PC_KIDS, "num_plans": 1},
        ],
    }
    r = requests.post(f"{BE}/api/customer-orders", json=body); return _p(r)


def ensure_rm(bom_lines, needed_qty):
    # top up RM stock to guarantee no shortage
    for ln in bom_lines:
        req = ln["consumption_per_pair"] * needed_qty * 10 + 5000
        requests.post(f"{BE}/api/rm-transactions", json={
            "material_id": ln["material_id"], "kind": "PURCHASE",
            "qty": req, "at": None, "remarks": "seed"
        })


def do_plan_to_finished(plan, all_pass=True):
    pid = plan["id"]
    # ensure RM upfront
    bom = requests.get(f"{BE}/api/boms").json()
    bom_for = next((b for b in bom if b["article_id"] == plan["article_id"]), None)
    ensure_rm(bom_for["lines"], plan["qty"])
    # start cutting
    r = requests.post(f"{BE}/api/plans/{pid}/start-cutting"); d = _p(r)
    assert d.get("ok"), d
    # issue to printing
    _p(requests.post(f"{BE}/api/plans/{pid}/issue-to-printing"))
    # issue to fabricator
    _p(requests.post(f"{BE}/api/plans/{pid}/issue-to-fabricator", json={"fabricator_id": FAB}))
    # receive stitching: return all as good, single bag
    sizes = plan["sizes_snapshot"]
    bags = [{"bag_no": "1", "sizes": [{"size": s["size"], "qty": s["pairs"]} for s in sizes], "remarks": ""}]
    size_results = [{"size": s["size"], "good": s["pairs"], "rework": 0, "reject": 0} for s in sizes]
    _p(requests.post(f"{BE}/api/plans/{pid}/receive-stitching", json={
        "bags": bags, "size_results": size_results, "remarks": ""
    }))
    # QC pass all
    qc_sizes = [{"size": s["size"], "passed": s["pairs"], "rework": 0, "hold": 0} for s in sizes]
    _p(requests.post(f"{BE}/api/plans/{pid}/qc", json={
        "size_results": qc_sizes, "defects": [], "worker": "QC1", "remarks": "ok"
    }))
    return pid


def do_plan_to_qc(plan):
    """Take plan through cutting -> printing -> fabricator -> receive-stitching. Ends in QC."""
    pid = plan["id"]
    bom = requests.get(f"{BE}/api/boms").json()
    bom_for = next((b for b in bom if b["article_id"] == plan["article_id"]), None)
    ensure_rm(bom_for["lines"], plan["qty"])
    d = _p(requests.post(f"{BE}/api/plans/{pid}/start-cutting"))
    assert d.get("ok"), d
    _p(requests.post(f"{BE}/api/plans/{pid}/issue-to-printing"))
    _p(requests.post(f"{BE}/api/plans/{pid}/issue-to-fabricator", json={"fabricator_id": FAB}))
    sizes = plan["sizes_snapshot"]
    bags = [{"bag_no": "1", "sizes": [{"size": s["size"], "qty": s["pairs"]} for s in sizes], "remarks": ""}]
    size_results = [{"size": s["size"], "good": s["pairs"], "rework": 0, "reject": 0} for s in sizes]
    _p(requests.post(f"{BE}/api/plans/{pid}/receive-stitching", json={
        "bags": bags, "size_results": size_results, "remarks": ""
    }))


def main():
    # top up ALL materials huge amount to overcome any prior negative state
    mats = requests.get(f"{BE}/api/materials").json()
    for m in mats:
        requests.post(f"{BE}/api/rm-transactions", json={
            "material_id": m["id"], "kind": "PURCHASE", "qty": 100000, "remarks": "bulk seed"
        })
    co = create_co()
    print("CO:", co["co_no"], co["id"])
    # generate plans for each item
    for it in co["items"]:
        _p(requests.post(f"{BE}/api/plans/generate", json={"order_item_id": it["id"], "count": it["num_plans"]}))
    # fetch plans of this CO
    plans = _p(requests.get(f"{BE}/api/plans"))
    my_plans = [p for p in plans if p["customer_order_id"] == co["id"]]
    print(f"Plans generated: {len(my_plans)}")
    # Take the plan to FINISHED for two of them; leave one at PLANNED for cancel test
    to_finish = my_plans[:2]
    to_leave = my_plans[2:]
    for p in to_finish:
        do_plan_to_finished(p)
        print(" finished plan", p["plan_no"])
    # verify ready-plans
    rp = _p(requests.get(f"{BE}/api/customers/{YASHVI}/ready-plans"))
    print("Ready plans for Yashvi:", len(rp), [(x["plan_no"], x.get("article_code"), x.get("customer_po")) for x in rp])
    print("Un-touched plans (for cancel test):", [(p["plan_no"], p["status"]) for p in to_leave])
    # take the remaining PLANNED plan into QC status (for QC-blank print test)
    if to_leave:
        do_plan_to_qc(to_leave[0])
        print(" moved", to_leave[0]["plan_no"], "to QC (for blank-QC test)")
    # Create a second small CO with 1 plan, left PLANNED for cancel test
    body2 = {
        "customer_id": YASHVI, "delivery_date": "2026-04-30", "priority": "Normal",
        "customer_po": "PO-TEST-CANCEL", "remarks": "for cancel test",
        "items": [{"article_id": ARTICLE_04, "colour_id": COLOUR_BLACK, "plan_config_id": PC_KIDS, "num_plans": 1}],
    }
    co2 = _p(requests.post(f"{BE}/api/customer-orders", json=body2))
    _p(requests.post(f"{BE}/api/plans/generate", json={"order_item_id": co2["items"][0]["id"], "count": 1}))
    plans2 = _p(requests.get(f"{BE}/api/plans"))
    my2 = [p for p in plans2 if p["customer_order_id"] == co2["id"]]
    print("Extra CO for cancel test:", co2["co_no"], "plans:", [(p["plan_no"], p["status"]) for p in my2])

if __name__ == "__main__":
    main()
