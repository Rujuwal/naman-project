"""NAMAN UPPER - Upper Manufacturing Control System - Backend"""
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone
import os
import uuid
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="NAMAN UPPER")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("naman")


# ==================== HELPERS ====================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


async def next_seq(kind: str, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    key = f"{kind}-{year}"
    doc = await db.document_sequences.find_one_and_update(
        {"_id": key},
        {"$inc": {"n": 1}},
        upsert=True,
        return_document=True,
    )
    return f"{prefix}-{year}-{doc['n']:04d}"


async def audit(action: str, entity: str, entity_id: str, user: str = "system", details: Optional[dict] = None):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "user": user,
        "at": now_iso(),
        "details": details or {},
    })


def clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


# ==================== MODELS (input) ====================
class NamedIn(BaseModel):
    name: str
    code: Optional[str] = None
    active: bool = True


class MaterialIn(BaseModel):
    name: str
    code: Optional[str] = None
    uom: str = "m"
    active: bool = True


class FabricatorIn(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    active: bool = True


class WorkerIn(BaseModel):
    name: str
    role: Optional[str] = None
    active: bool = True


class PlanConfigSize(BaseModel):
    size: str
    pairs: int


class PlanConfigIn(BaseModel):
    article_id: str
    name: str
    sizes: List[PlanConfigSize]
    active: bool = True


class ComponentConfigIn(BaseModel):
    article_id: str
    plan_config_id: str
    component: str
    bundles: List[Dict[str, Any]]  # [{bundle_no, sizes:[{size,qty}], formula}]
    sequence: int = 0
    active: bool = True


class BomLine(BaseModel):
    material_id: str
    consumption_per_pair: float
    uom: str = "m"


class BomIn(BaseModel):
    article_id: str
    colour_id: Optional[str] = None
    lines: List[BomLine]
    version: int = 1
    active: bool = True


class ArticleIn(BaseModel):
    code: str
    name: str
    active: bool = True


class ColourIn(BaseModel):
    name: str
    active: bool = True


class UomIn(BaseModel):
    name: str
    active: bool = True


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    active: bool = True


class RmTxIn(BaseModel):
    material_id: str
    kind: str  # OPENING/PURCHASE/ADJUSTMENT_IN/ADJUSTMENT_OUT
    qty: float
    remarks: Optional[str] = None


class COItemIn(BaseModel):
    article_id: str
    plan_config_id: str
    colour_id: str
    num_plans: int


class CustomerOrderIn(BaseModel):
    customer_id: str
    delivery_date: Optional[str] = None
    priority: str = "Normal"
    customer_po: Optional[str] = None
    remarks: Optional[str] = None
    items: List[COItemIn]


class GeneratePlansIn(BaseModel):
    order_item_id: str
    count: int


class SizeQty(BaseModel):
    size: str
    qty: int


class BagIn(BaseModel):
    bag_no: str
    sizes: List[SizeQty]
    remarks: Optional[str] = None


class ReturnIn(BaseModel):
    bags: List[BagIn]
    # size-wise good/rework/reject
    size_results: List[Dict[str, Any]]  # {size, good, rework, reject}
    remarks: Optional[str] = None


class QCSizeResult(BaseModel):
    size: str
    passed: int
    rework: int
    hold: int


class QCIn(BaseModel):
    size_results: List[QCSizeResult]
    defects: List[str] = []
    remarks: Optional[str] = None
    worker: Optional[str] = None


class DispatchBagRef(BaseModel):
    return_id: str
    bag_no: str


class DispatchIn(BaseModel):
    customer_id: str
    plan_ids: List[str]
    bags: List[DispatchBagRef]
    transporter: Optional[str] = None
    vehicle_lr: Optional[str] = None
    remarks: Optional[str] = None


class CancelIn(BaseModel):
    reason: str


# ==================== MASTERS (simple CRUD) ====================
async def _list(col: str, q: Optional[dict] = None):
    return [clean(d) for d in await db[col].find(q or {}).to_list(2000)]


async def _create(col: str, data: dict, entity: str):
    data["id"] = new_id()
    data["created_at"] = now_iso()
    await db[col].insert_one(data)
    await audit("CREATE", entity, data["id"], details={"name": data.get("name")})
    return clean(data)


async def _update(col: str, id: str, data: dict, entity: str):
    data["updated_at"] = now_iso()
    r = await db[col].find_one_and_update({"id": id}, {"$set": data}, return_document=True)
    if not r:
        raise HTTPException(404, f"{entity} not found")
    await audit("UPDATE", entity, id, details=data)
    return clean(r)


# Customers
@api.get("/customers")
async def list_customers():
    return await _list("customers")

@api.post("/customers")
async def create_customer(inp: CustomerIn):
    return await _create("customers", inp.model_dump(), "customer")

@api.put("/customers/{id}")
async def update_customer(id: str, inp: CustomerIn):
    return await _update("customers", id, inp.model_dump(), "customer")

# Articles
@api.get("/articles")
async def list_articles():
    return await _list("articles")

@api.post("/articles")
async def create_article(inp: ArticleIn):
    return await _create("articles", inp.model_dump(), "article")

@api.put("/articles/{id}")
async def update_article(id: str, inp: ArticleIn):
    return await _update("articles", id, inp.model_dump(), "article")

# Colours
@api.get("/colours")
async def list_colours():
    return await _list("colours")

@api.post("/colours")
async def create_colour(inp: ColourIn):
    return await _create("colours", inp.model_dump(), "colour")

@api.put("/colours/{id}")
async def update_colour(id: str, inp: ColourIn):
    return await _update("colours", id, inp.model_dump(), "colour")

# UOMs
@api.get("/uoms")
async def list_uoms():
    return await _list("uoms")

@api.post("/uoms")
async def create_uom(inp: UomIn):
    return await _create("uoms", inp.model_dump(), "uom")

# Materials
@api.get("/materials")
async def list_materials():
    mats = await _list("materials")
    # attach current stock
    for m in mats:
        m["current_stock"] = await _material_stock(m["id"])
    return mats

@api.post("/materials")
async def create_material(inp: MaterialIn):
    return await _create("materials", inp.model_dump(), "material")

@api.put("/materials/{id}")
async def update_material(id: str, inp: MaterialIn):
    return await _update("materials", id, inp.model_dump(), "material")

# Fabricators
@api.get("/fabricators")
async def list_fabricators():
    return await _list("fabricators")

@api.post("/fabricators")
async def create_fabricator(inp: FabricatorIn):
    return await _create("fabricators", inp.model_dump(), "fabricator")

@api.put("/fabricators/{id}")
async def update_fabricator(id: str, inp: FabricatorIn):
    return await _update("fabricators", id, inp.model_dump(), "fabricator")

# Workers
@api.get("/workers")
async def list_workers():
    return await _list("workers")

@api.post("/workers")
async def create_worker(inp: WorkerIn):
    return await _create("workers", inp.model_dump(), "worker")

# Plan Configurations
@api.get("/plan-configs")
async def list_plan_configs(article_id: Optional[str] = None):
    q = {"article_id": article_id} if article_id else {}
    pcs = await _list("plan_configurations", q)
    for pc in pcs:
        pc["total_pairs"] = sum(s["pairs"] for s in pc["sizes"])
    return pcs

@api.post("/plan-configs")
async def create_plan_config(inp: PlanConfigIn):
    d = inp.model_dump()
    return await _create("plan_configurations", d, "plan_config")

@api.put("/plan-configs/{id}")
async def update_plan_config(id: str, inp: PlanConfigIn):
    return await _update("plan_configurations", id, inp.model_dump(), "plan_config")

# Component Configurations
@api.get("/component-configs")
async def list_component_configs(plan_config_id: Optional[str] = None):
    q = {"plan_config_id": plan_config_id} if plan_config_id else {}
    return await _list("component_configurations", q)

@api.post("/component-configs")
async def create_component_config(inp: ComponentConfigIn):
    return await _create("component_configurations", inp.model_dump(), "component_config")

@api.put("/component-configs/{id}")
async def update_component_config(id: str, inp: ComponentConfigIn):
    return await _update("component_configurations", id, inp.model_dump(), "component_config")

# BOMs
@api.get("/boms")
async def list_boms(article_id: Optional[str] = None):
    q = {"article_id": article_id} if article_id else {}
    return await _list("boms", q)

@api.post("/boms")
async def create_bom(inp: BomIn):
    return await _create("boms", inp.model_dump(), "bom")

@api.put("/boms/{id}")
async def update_bom(id: str, inp: BomIn):
    return await _update("boms", id, inp.model_dump(), "bom")


# ==================== RM STOCK ====================
async def _material_stock(material_id: str) -> float:
    total = 0.0
    async for tx in db.material_transactions.find({"material_id": material_id}):
        total += tx["signed_qty"]
    return round(total, 4)


@api.get("/rm-stock")
async def rm_stock():
    mats = await _list("materials")
    result = []
    for m in mats:
        current = await _material_stock(m["id"])
        committed = 0.0
        # committed = required for plans in PLANNED status
        async for p in db.production_plans.find({"status": "PLANNED"}):
            # get BOM for article
            bom = await _find_bom(p["article_id"], p.get("colour_id"))
            if not bom:
                continue
            for ln in bom["lines"]:
                if ln["material_id"] == m["id"]:
                    committed += ln["consumption_per_pair"] * p["qty"]
        result.append({
            "material_id": m["id"],
            "material_name": m["name"],
            "uom": m.get("uom", "m"),
            "current": current,
            "committed": round(committed, 4),
            "free": round(current - committed, 4),
        })
    return result


@api.post("/rm-transactions")
async def create_rm_tx(inp: RmTxIn):
    sign = 1 if inp.kind in ("OPENING", "PURCHASE", "ADJUSTMENT_IN", "MATERIAL_RETURN") else -1
    tx = {
        "id": new_id(),
        "material_id": inp.material_id,
        "kind": inp.kind,
        "qty": inp.qty,
        "signed_qty": sign * inp.qty,
        "remarks": inp.remarks,
        "at": now_iso(),
    }
    await db.material_transactions.insert_one(tx)
    await audit("RM_TX", "material", inp.material_id, details={"kind": inp.kind, "qty": inp.qty})
    return clean(tx)


@api.get("/rm-ledger")
async def rm_ledger(material_id: Optional[str] = None):
    q = {"material_id": material_id} if material_id else {}
    return [clean(t) for t in await db.material_transactions.find(q).sort("at", -1).to_list(2000)]


@api.get("/material-requirement")
async def material_requirement():
    """Total required from confirmed customer orders (via plans not yet finished)."""
    mats = {m["id"]: {**m, "current": await _material_stock(m["id"]), "required": 0.0} for m in await _list("materials")}
    async for p in db.production_plans.find({"status": {"$in": ["PLANNED", "CUTTING", "PRINTING", "STITCHING_OUT", "STITCHING_RETURN", "QC", "REWORK"]}}):
        bom = await _find_bom(p["article_id"], p.get("colour_id"))
        if not bom:
            continue
        for ln in bom["lines"]:
            if ln["material_id"] in mats:
                mats[ln["material_id"]]["required"] += ln["consumption_per_pair"] * p["qty"]
    result = []
    for m in mats.values():
        req = round(m["required"], 4)
        cur = round(m["current"], 4)
        shortage = round(max(req - cur, 0), 4)
        result.append({
            "material_id": m["id"], "material_name": m["name"], "uom": m.get("uom", "m"),
            "required": req, "current": cur, "free": cur, "shortage": shortage,
            "purchase_required": shortage,
        })
    return result


async def _find_bom(article_id: str, colour_id: Optional[str]):
    if colour_id:
        b = await db.boms.find_one({"article_id": article_id, "colour_id": colour_id, "active": True})
        if b:
            return clean(b)
    b = await db.boms.find_one({"article_id": article_id, "colour_id": None, "active": True})
    return clean(b) if b else None


# ==================== CUSTOMER ORDERS ====================
@api.get("/customer-orders")
async def list_customer_orders():
    orders = [clean(o) for o in await db.customer_orders.find({}).sort("created_at", -1).to_list(2000)]
    return orders


@api.post("/customer-orders")
async def create_customer_order(inp: CustomerOrderIn):
    co_no = await next_seq("CO", "CO")
    items = []
    total_qty = 0
    total_plans = 0
    for it in inp.items:
        pc = await db.plan_configurations.find_one({"id": it.plan_config_id})
        if not pc:
            raise HTTPException(400, "Plan configuration not found")
        qty_per_plan = sum(s["pairs"] for s in pc["sizes"])
        item_total = qty_per_plan * it.num_plans
        items.append({
            "id": new_id(),
            "article_id": it.article_id,
            "plan_config_id": it.plan_config_id,
            "colour_id": it.colour_id,
            "num_plans": it.num_plans,
            "qty_per_plan": qty_per_plan,
            "total_qty": item_total,
            "plans_generated": 0,
        })
        total_qty += item_total
        total_plans += it.num_plans

    doc = {
        "id": new_id(),
        "co_no": co_no,
        "order_date": now_iso(),
        "customer_id": inp.customer_id,
        "delivery_date": inp.delivery_date,
        "priority": inp.priority,
        "customer_po": inp.customer_po,
        "remarks": inp.remarks,
        "items": items,
        "total_qty": total_qty,
        "total_plans": total_plans,
        "status": "OPEN",
        "created_at": now_iso(),
    }
    await db.customer_orders.insert_one(doc)
    await audit("CREATE", "customer_order", doc["id"], details={"co_no": co_no})
    return clean(doc)


@api.get("/customer-orders/{id}")
async def get_customer_order(id: str):
    o = await db.customer_orders.find_one({"id": id})
    if not o:
        raise HTTPException(404, "Order not found")
    plans = [clean(p) for p in await db.production_plans.find({"customer_order_id": id}).to_list(1000)]
    return {"order": clean(o), "plans": plans}


# ==================== PRODUCTION PLANS ====================
@api.post("/plans/generate")
async def generate_plans(inp: GeneratePlansIn):
    # find order + item
    order = None
    order_item = None
    async for o in db.customer_orders.find({}):
        for it in o["items"]:
            if it["id"] == inp.order_item_id:
                order = o
                order_item = it
                break
        if order:
            break
    if not order:
        raise HTTPException(404, "Order item not found")

    remaining = order_item["num_plans"] - order_item["plans_generated"]
    if inp.count > remaining:
        raise HTTPException(400, f"Only {remaining} plans remain for this item")

    pc = await db.plan_configurations.find_one({"id": order_item["plan_config_id"]})
    if not pc:
        raise HTTPException(400, "Plan configuration not found")

    created = []
    for _ in range(inp.count):
        plan_no = await next_seq("PLAN", "PLAN")
        plan = {
            "id": new_id(),
            "plan_no": plan_no,
            "plan_date": now_iso(),
            "customer_order_id": order["id"],
            "co_no": order["co_no"],
            "order_item_id": order_item["id"],
            "article_id": order_item["article_id"],
            "colour_id": order_item["colour_id"],
            "plan_config_id": order_item["plan_config_id"],
            "plan_config_name": pc["name"],
            "sizes_snapshot": pc["sizes"],
            "qty": order_item["qty_per_plan"],
            "due_date": order.get("delivery_date"),
            "priority": order.get("priority", "Normal"),
            "status": "PLANNED",
            "current_stage": "Planned",
            "dispatched_qty": 0,
            "qc_passed_by_size": {},
            "events": [{"at": now_iso(), "action": "Plan Created", "user": "system"}],
            "created_at": now_iso(),
        }
        await db.production_plans.insert_one(plan)
        created.append(clean(plan))
        await audit("CREATE", "plan", plan["id"], details={"plan_no": plan_no})

    # increment plans_generated
    order_item["plans_generated"] += inp.count
    await db.customer_orders.update_one({"id": order["id"]}, {"$set": {"items": order["items"]}})
    return created


@api.get("/plans")
async def list_plans(status: Optional[str] = None):
    q = {}
    if status:
        if status == "STITCHING":
            q["status"] = {"$in": ["STITCHING_OUT", "STITCHING_RETURN"]}
        else:
            q["status"] = status
    plans = [clean(p) for p in await db.production_plans.find(q).sort("created_at", -1).to_list(2000)]
    return plans


@api.get("/plans/{id}")
async def get_plan(id: str):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    p = clean(p)
    # attach related docs
    p["fabricator_jobs"] = [clean(x) for x in await db.fabricator_jobs.find({"plan_id": id}).to_list(100)]
    p["returns"] = [clean(x) for x in await db.fabricator_returns.find({"plan_id": id}).to_list(100)]
    p["qc_records"] = [clean(x) for x in await db.qc_records.find({"plan_id": id}).to_list(100)]
    return p


def _record_event(plan_id: str, action: str, user: str = "system"):
    return {"at": now_iso(), "action": action, "user": user}


@api.post("/plans/{id}/start-cutting")
async def start_cutting(id: str):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] != "PLANNED":
        raise HTTPException(400, f"Cannot start cutting from status {p['status']}")

    bom = await _find_bom(p["article_id"], p.get("colour_id"))
    if not bom:
        raise HTTPException(400, "BOM not defined for this article/colour")

    # Check availability
    shortages = []
    deductions = []
    for ln in bom["lines"]:
        mat = await db.materials.find_one({"id": ln["material_id"]})
        if not mat:
            continue
        required = ln["consumption_per_pair"] * p["qty"]
        current = await _material_stock(ln["material_id"])
        if current < required:
            shortages.append({
                "material_name": mat["name"],
                "required": round(required, 4),
                "available": round(current, 4),
                "shortage": round(required - current, 4),
                "uom": ln.get("uom", "m"),
            })
        deductions.append({"material_id": ln["material_id"], "material_name": mat["name"], "qty": required})

    if shortages:
        return {"ok": False, "shortages": shortages}

    # Atomic deduction
    for d in deductions:
        await db.material_transactions.insert_one({
            "id": new_id(),
            "material_id": d["material_id"],
            "kind": "MATERIAL_CONSUMPTION",
            "qty": d["qty"],
            "signed_qty": -d["qty"],
            "plan_id": id,
            "at": now_iso(),
            "remarks": f"Cutting Plan {p['plan_no']}",
        })

    # Snapshot BOM on plan
    ev = p.get("events", []) + [_record_event(id, "Cutting Started")]
    cutting_no = await next_seq("CUT", "CUT")
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "CUTTING",
        "current_stage": "Cutting",
        "bom_snapshot": bom,
        "cutting_no": cutting_no,
        "cutting_started_at": now_iso(),
        "events": ev,
    }})
    await audit("START_CUTTING", "plan", id, details={"deductions": deductions})
    return {"ok": True, "cutting_no": cutting_no, "deductions": deductions}


@api.post("/plans/{id}/issue-to-printing")
async def issue_to_printing(id: str):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] != "CUTTING":
        raise HTTPException(400, f"Plan must be in CUTTING; current: {p['status']}")
    printing_no = await next_seq("PRN", "PRN")
    ev = p.get("events", []) + [_record_event(id, "Issued to Printing")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "PRINTING", "current_stage": "Printing",
        "printing_no": printing_no,
        "printing_started_at": now_iso(),
        "events": ev,
    }})
    await audit("ISSUE_TO_PRINTING", "plan", id)
    return {"ok": True, "printing_no": printing_no}


class IssueFabricatorIn(BaseModel):
    fabricator_id: str
    due_date: Optional[str] = None
    instructions: Optional[str] = None


@api.post("/plans/{id}/issue-to-fabricator")
async def issue_to_fabricator(id: str, inp: IssueFabricatorIn):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] != "PRINTING":
        raise HTTPException(400, f"Plan must be in PRINTING; current: {p['status']}")
    fab = await db.fabricators.find_one({"id": inp.fabricator_id})
    if not fab:
        raise HTTPException(400, "Fabricator not found")

    st_no = await next_seq("ST", "ST")
    job = {
        "id": new_id(),
        "stitching_no": st_no,
        "plan_id": id,
        "plan_no": p["plan_no"],
        "fabricator_id": inp.fabricator_id,
        "fabricator_name": fab["name"],
        "issue_date": now_iso(),
        "due_date": inp.due_date,
        "instructions": inp.instructions,
        "qty_given": p["qty"],
        "qty_returned": 0,
        "status": "OUTSIDE",
    }
    await db.fabricator_jobs.insert_one(job)
    ev = p.get("events", []) + [_record_event(id, "Issued to Fabricator")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "STITCHING_OUT", "current_stage": "Stitching Out",
        "stitching_no": st_no,
        "fabricator_id": inp.fabricator_id,
        "fabricator_name": fab["name"],
        "stitching_started_at": now_iso(),
        "events": ev,
    }})
    await audit("ISSUE_TO_FABRICATOR", "plan", id, details={"fabricator": fab["name"]})
    return {"ok": True, "stitching_no": st_no}


@api.post("/plans/{id}/receive-stitching")
async def receive_stitching(id: str, inp: ReturnIn):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] not in ("STITCHING_OUT",):
        raise HTTPException(400, f"Plan must be in STITCHING_OUT; current: {p['status']}")

    # validate size totals do not exceed plan sizes
    plan_sizes = {s["size"]: s["pairs"] for s in p["sizes_snapshot"]}
    for sr in inp.size_results:
        total = sr.get("good", 0) + sr.get("rework", 0) + sr.get("reject", 0)
        if total > plan_sizes.get(sr["size"], 0):
            raise HTTPException(400, f"Size {sr['size']} return ({total}) exceeds plan size ({plan_sizes.get(sr['size'], 0)})")

    # validate bag sizes match totals
    bag_size_totals: Dict[str, int] = {}
    for b in inp.bags:
        for s in b.sizes:
            bag_size_totals[s.size] = bag_size_totals.get(s.size, 0) + s.qty
    for sr in inp.size_results:
        total = sr.get("good", 0) + sr.get("rework", 0) + sr.get("reject", 0)
        # rework goes back; but bags carry actual physical items -> good + rework typically in bags
        # We'll validate bag size <= plan size
        if bag_size_totals.get(sr["size"], 0) > plan_sizes.get(sr["size"], 0):
            raise HTTPException(400, f"Bag totals for size {sr['size']} exceed plan size")

    ret_no = await next_seq("RET", "RET")
    total_returned = sum(sr.get("good", 0) + sr.get("rework", 0) + sr.get("reject", 0) for sr in inp.size_results)
    total_bags = len(inp.bags)
    total_bag_pairs = sum(sum(s.qty for s in b.sizes) for b in inp.bags)

    doc = {
        "id": new_id(),
        "return_no": ret_no,
        "plan_id": id,
        "plan_no": p["plan_no"],
        "fabricator_id": p.get("fabricator_id"),
        "fabricator_name": p.get("fabricator_name"),
        "return_date": now_iso(),
        "bags": [{"bag_no": b.bag_no, "sizes": [s.model_dump() for s in b.sizes],
                  "total": sum(s.qty for s in b.sizes),
                  "remarks": b.remarks,
                  "dispatched": False} for b in inp.bags],
        "size_results": inp.size_results,
        "total_returned": total_returned,
        "total_bags": total_bags,
        "total_bag_pairs": total_bag_pairs,
        "remarks": inp.remarks,
    }
    await db.fabricator_returns.insert_one(doc)

    # update job
    await db.fabricator_jobs.update_many({"plan_id": id}, {"$inc": {"qty_returned": total_returned}})
    job = await db.fabricator_jobs.find_one({"plan_id": id})
    if job and job["qty_returned"] >= job["qty_given"]:
        await db.fabricator_jobs.update_one({"id": job["id"]}, {"$set": {"status": "RETURNED"}})

    ev = p.get("events", []) + [_record_event(id, "Stitching Returned")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "QC",
        "current_stage": "QC",
        "events": ev,
    }})
    await audit("RECEIVE_STITCHING", "plan", id, details={"returned": total_returned})
    return {"ok": True, "return_no": ret_no}


@api.post("/plans/{id}/qc")
async def do_qc(id: str, inp: QCIn):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] not in ("QC", "REWORK"):
        raise HTTPException(400, f"Plan must be in QC; current: {p['status']}")

    # Validate: pass+rework+hold <= returned (from latest return)
    ret = await db.fabricator_returns.find_one({"plan_id": id}, sort=[("return_date", -1)])
    if not ret:
        raise HTTPException(400, "No stitching return found for QC")
    ret_by_size = {sr["size"]: sr.get("good", 0) + sr.get("rework", 0) for sr in ret["size_results"]}
    total_pass = 0
    total_rework = 0
    total_hold = 0
    for sr in inp.size_results:
        s_total = sr.passed + sr.rework + sr.hold
        if s_total > ret_by_size.get(sr.size, 0):
            raise HTTPException(400, f"Size {sr.size} QC ({s_total}) exceeds returned quantity ({ret_by_size.get(sr.size, 0)})")
        total_pass += sr.passed
        total_rework += sr.rework
        total_hold += sr.hold

    qc_no = await next_seq("QC", "QC")
    doc = {
        "id": new_id(),
        "qc_no": qc_no,
        "plan_id": id,
        "plan_no": p["plan_no"],
        "return_id": ret["id"],
        "inspection_date": now_iso(),
        "size_results": [sr.model_dump() for sr in inp.size_results],
        "defects": inp.defects,
        "remarks": inp.remarks,
        "worker": inp.worker,
        "total_pass": total_pass,
        "total_rework": total_rework,
        "total_hold": total_hold,
    }
    await db.qc_records.insert_one(doc)

    # accumulate qc_passed_by_size
    accumulated = p.get("qc_passed_by_size", {}) or {}
    for sr in inp.size_results:
        accumulated[sr.size] = accumulated.get(sr.size, 0) + sr.passed
        if sr.passed > 0:
            # create finished stock transaction
            await db.finished_stock_transactions.insert_one({
                "id": new_id(),
                "plan_id": id,
                "plan_no": p["plan_no"],
                "article_id": p["article_id"],
                "colour_id": p.get("colour_id"),
                "plan_config_id": p["plan_config_id"],
                "size": sr.size,
                "qty": sr.passed,
                "signed_qty": sr.passed,
                "kind": "QC_PASS",
                "qc_id": doc["id"],
                "at": now_iso(),
            })

    # decide next status
    new_status = p["status"]
    stage = p["current_stage"]
    if total_rework > 0:
        new_status = "REWORK"
        stage = "Rework"
    elif total_hold > 0 and total_pass == 0:
        new_status = "HOLD"
        stage = "Hold"
    else:
        # any passed? move to finished stock
        new_status = "FINISHED"
        stage = "Finished Stock"

    ev = p.get("events", []) + [_record_event(id, f"QC Completed ({new_status})")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": new_status,
        "current_stage": stage,
        "qc_passed_by_size": accumulated,
        "events": ev,
    }})
    await audit("QC", "plan", id, details={"pass": total_pass, "rework": total_rework, "hold": total_hold})
    return {"ok": True, "qc_no": qc_no, "status": new_status}


class ReworkReturnIn(BaseModel):
    remarks: Optional[str] = None


@api.post("/plans/{id}/rework-return")
async def rework_return(id: str, inp: ReworkReturnIn):
    """Rework corrected → back to QC."""
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] != "REWORK":
        raise HTTPException(400, f"Plan must be in REWORK; current: {p['status']}")
    ev = p.get("events", []) + [_record_event(id, "Rework Returned to QC")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "QC", "current_stage": "QC", "events": ev,
    }})
    return {"ok": True}


# ==================== FINISHED STOCK ====================
@api.get("/finished-stock")
async def finished_stock():
    """Aggregate finished stock by plan+size, denormalize via plan lookup."""
    agg = {}
    async for tx in db.finished_stock_transactions.find({}):
        pid = tx.get("plan_id")
        size = tx.get("size")
        if not pid or not size:
            continue
        key = (pid, size)
        agg[key] = agg.get(key, 0) + tx.get("signed_qty", 0)

    articles = {a["id"]: a for a in await _list("articles")}
    colours = {c["id"]: c for c in await _list("colours")}
    pcs = {p["id"]: p for p in await _list("plan_configurations")}
    plans_cache = {}
    result = []
    for (pid, size), qty in agg.items():
        if qty <= 0:
            continue
        plan = plans_cache.get(pid)
        if plan is None:
            plan = await db.production_plans.find_one({"id": pid}) or {}
            plans_cache[pid] = plan
        aid = plan.get("article_id")
        cid = plan.get("colour_id")
        pcid = plan.get("plan_config_id")
        result.append({
            "article_id": aid, "article_name": articles.get(aid, {}).get("name"),
            "colour_id": cid, "colour_name": colours.get(cid, {}).get("name") if cid else None,
            "plan_config_id": pcid, "plan_config_name": pcs.get(pcid, {}).get("name"),
            "plan_id": pid, "plan_no": plan.get("plan_no"),
            "size": size, "qty": qty,
        })
    return result


# ==================== DISPATCH ====================
@api.get("/dispatches")
async def list_dispatches(status: Optional[str] = None):
    q = {"status": status} if status else {}
    return [clean(d) for d in await db.dispatches.find(q).sort("created_at", -1).to_list(2000)]


@api.get("/dispatches/{id}")
async def get_dispatch(id: str):
    d = await db.dispatches.find_one({"id": id})
    if not d:
        raise HTTPException(404, "Dispatch not found")
    return clean(d)


@api.get("/available-bags")
async def available_bags(plan_ids: str):
    """Get undispatched bags for given plans (comma-separated)."""
    ids = [x.strip() for x in plan_ids.split(",") if x.strip()]
    bags = []
    for pid in ids:
        async for r in db.fabricator_returns.find({"plan_id": pid}):
            plan = await db.production_plans.find_one({"id": pid})
            for b in r["bags"]:
                if b.get("dispatched"):
                    continue
                bags.append({
                    "return_id": r["id"],
                    "return_no": r["return_no"],
                    "plan_id": pid,
                    "plan_no": plan["plan_no"] if plan else None,
                    "fabricator_name": r.get("fabricator_name"),
                    "bag_no": b["bag_no"],
                    "sizes": b["sizes"],
                    "total": b["total"],
                    "remarks": b.get("remarks"),
                })
    return bags


@api.post("/dispatches")
async def create_dispatch(inp: DispatchIn):
    # Load selected plans and derive COs / articles / colours
    plans_data = []
    for pid in inp.plan_ids:
        p = await db.production_plans.find_one({"id": pid})
        if not p:
            raise HTTPException(400, f"Plan {pid} not found")
        plans_data.append(p)
    customer_order_ids = list({p["customer_order_id"] for p in plans_data})

    # Validate customer consistency
    for coid in customer_order_ids:
        o = await db.customer_orders.find_one({"id": coid})
        if not o or o["customer_id"] != inp.customer_id:
            raise HTTPException(400, "Selected plans do not belong to the chosen customer")

    # Aggregate what will be dispatched from selected bags
    size_qty: Dict[str, int] = {}
    bag_details = []
    for bref in inp.bags:
        r = await db.fabricator_returns.find_one({"id": bref.return_id})
        if not r:
            raise HTTPException(400, "Return not found")
        target = next((b for b in r["bags"] if b["bag_no"] == bref.bag_no), None)
        if not target:
            raise HTTPException(400, f"Bag {bref.bag_no} not found")
        if target.get("dispatched"):
            raise HTTPException(400, f"Bag {bref.bag_no} already dispatched")
        for s in target["sizes"]:
            size_qty[s["size"]] = size_qty.get(s["size"], 0) + s["qty"]
        plan_of_bag = next((p for p in plans_data if p["id"] == r["plan_id"]), None)
        bag_details.append({
            "return_id": bref.return_id,
            "return_no": r["return_no"],
            "plan_id": r["plan_id"],
            "plan_no": r["plan_no"],
            "article_id": plan_of_bag.get("article_id") if plan_of_bag else None,
            "colour_id": plan_of_bag.get("colour_id") if plan_of_bag else None,
            "plan_config_id": plan_of_bag.get("plan_config_id") if plan_of_bag else None,
            "fabricator_name": r.get("fabricator_name"),
            "bag_no": bref.bag_no,
            "sizes": target["sizes"],
            "total": target["total"],
        })

    dsp_no = await next_seq("DSP", "DSP")
    total_bags = len(bag_details)
    total_pairs = sum(b["total"] for b in bag_details)

    # Deduct finished stock per (plan, size) based on bag composition
    for b in bag_details:
        pid = b["plan_id"]
        for s in b["sizes"]:
            cur = 0
            async for tx in db.finished_stock_transactions.find({"plan_id": pid, "size": s["size"]}):
                cur += tx["signed_qty"]
            if cur < s["qty"]:
                raise HTTPException(400, f"Insufficient finished stock for plan {b['plan_no']} size {s['size']} (have {cur}, need {s['qty']})")
            await db.finished_stock_transactions.insert_one({
                "id": new_id(),
                "plan_id": pid,
                "plan_no": b["plan_no"],
                "size": s["size"],
                "qty": s["qty"],
                "signed_qty": -s["qty"],
                "kind": "DISPATCH",
                "dispatch_no": dsp_no,
                "at": now_iso(),
            })

    # Mark bags dispatched
    for bref in inp.bags:
        r = await db.fabricator_returns.find_one({"id": bref.return_id})
        for b in r["bags"]:
            if b["bag_no"] == bref.bag_no:
                b["dispatched"] = True
                b["dispatch_no"] = dsp_no
        await db.fabricator_returns.update_one({"id": r["id"]}, {"$set": {"bags": r["bags"]}})

    # Increment plan dispatched_qty; update plan status when fully dispatched
    plan_totals: Dict[str, int] = {}
    for b in bag_details:
        plan_totals[b["plan_id"]] = plan_totals.get(b["plan_id"], 0) + b["total"]
    for pid, extra in plan_totals.items():
        await db.production_plans.update_one({"id": pid}, {"$inc": {"dispatched_qty": extra}})
        p2 = await db.production_plans.find_one({"id": pid})
        if p2 and p2.get("dispatched_qty", 0) >= p2.get("qty", 0) and p2.get("status") != "CANCELLED":
            ev = p2.get("events", []) + [_record_event(pid, "Dispatched (full)")]
            await db.production_plans.update_one({"id": pid}, {"$set": {
                "status": "DISPATCHED", "current_stage": "Dispatched", "events": ev,
            }})

    # Collect customer_pos and co_nos
    customer_pos = []
    co_nos = []
    for coid in customer_order_ids:
        o = await db.customer_orders.find_one({"id": coid})
        if o:
            co_nos.append(o.get("co_no"))
            if o.get("customer_po"):
                customer_pos.append(o["customer_po"])

    doc = {
        "id": new_id(),
        "dispatch_no": dsp_no,
        "dispatch_date": now_iso(),
        "customer_id": inp.customer_id,
        "customer_order_ids": customer_order_ids,
        "customer_order_id": customer_order_ids[0] if customer_order_ids else None,
        "co_nos": co_nos,
        "customer_pos": customer_pos,
        "plan_ids": inp.plan_ids,
        "bags": bag_details,
        "size_totals": size_qty,
        "total_bags": total_bags,
        "total_pairs": total_pairs,
        "transporter": inp.transporter,
        "vehicle_lr": inp.vehicle_lr,
        "remarks": inp.remarks,
        "status": "DISPATCHED",
        "created_at": now_iso(),
    }
    await db.dispatches.insert_one(doc)
    await audit("CREATE", "dispatch", doc["id"], details={"dispatch_no": dsp_no})
    return clean(doc)


@api.post("/dispatches/{id}/cancel")
async def cancel_dispatch(id: str, inp: CancelIn):
    d = await db.dispatches.find_one({"id": id})
    if not d:
        raise HTTPException(404, "Dispatch not found")
    if d["status"] == "CANCELLED":
        raise HTTPException(400, "Already cancelled")

    # reverse finished stock
    for b in d["bags"]:
        for s in b["sizes"]:
            await db.finished_stock_transactions.insert_one({
                "id": new_id(),
                "plan_id": b["plan_id"],
                "plan_no": b["plan_no"],
                "size": s["size"],
                "qty": s["qty"],
                "signed_qty": s["qty"],
                "kind": "DISPATCH_CANCEL",
                "dispatch_no": d["dispatch_no"],
                "at": now_iso(),
            })
        # unmark bags
        r = await db.fabricator_returns.find_one({"id": b["return_id"]})
        if r:
            for bag in r["bags"]:
                if bag["bag_no"] == b["bag_no"]:
                    bag["dispatched"] = False
                    bag.pop("dispatch_no", None)
            await db.fabricator_returns.update_one({"id": r["id"]}, {"$set": {"bags": r["bags"]}})
        await db.production_plans.update_one({"id": b["plan_id"]}, {"$inc": {"dispatched_qty": -b["total"]}})
        # If plan was fully dispatched, revert status to FINISHED
        p2 = await db.production_plans.find_one({"id": b["plan_id"]})
        if p2 and p2.get("status") == "DISPATCHED" and p2.get("dispatched_qty", 0) < p2.get("qty", 0):
            ev = p2.get("events", []) + [_record_event(b["plan_id"], "Dispatch Cancelled - back to Finished")]
            await db.production_plans.update_one({"id": b["plan_id"]}, {"$set": {
                "status": "FINISHED", "current_stage": "Finished Stock", "events": ev,
            }})

    await db.dispatches.update_one({"id": id}, {"$set": {
        "status": "CANCELLED",
        "cancel_reason": inp.reason,
        "cancelled_at": now_iso(),
    }})
    await audit("CANCEL", "dispatch", id, details={"reason": inp.reason})
    return {"ok": True}


# ==================== CANCEL PLAN ====================
@api.post("/plans/{id}/cancel")
async def cancel_plan(id: str, inp: CancelIn):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p.get("status") in ("CANCELLED", "DISPATCHED"):
        raise HTTPException(400, f"Cannot cancel plan in status {p.get('status')}")

    # Reverse RM consumption for this plan if any
    consumed = 0
    async for tx in db.material_transactions.find({"plan_id": id, "kind": "MATERIAL_CONSUMPTION"}):
        # emit reversing tx
        await db.material_transactions.insert_one({
            "id": new_id(),
            "material_id": tx["material_id"],
            "kind": "MATERIAL_RETURN",
            "qty": tx["qty"],
            "signed_qty": tx["qty"],
            "plan_id": id,
            "at": now_iso(),
            "remarks": f"Plan {p['plan_no']} cancelled - material returned",
        })
        consumed += 1

    # Reverse finished stock QC_PASS entries (only if no dispatch remains)
    async for ftx in db.finished_stock_transactions.find({"plan_id": id, "kind": "QC_PASS"}):
        await db.finished_stock_transactions.insert_one({
            "id": new_id(),
            "plan_id": id,
            "plan_no": p["plan_no"],
            "size": ftx["size"],
            "qty": ftx["qty"],
            "signed_qty": -ftx["qty"],
            "kind": "ADJUSTMENT_OUT",
            "at": now_iso(),
            "remarks": "Plan cancelled",
        })

    # Decrement plans_generated on order item so order remaining is restored
    order = await db.customer_orders.find_one({"id": p.get("customer_order_id")})
    if order:
        for it in order["items"]:
            if it["id"] == p.get("order_item_id"):
                it["plans_generated"] = max(0, it.get("plans_generated", 0) - 1)
        await db.customer_orders.update_one({"id": order["id"]}, {"$set": {"items": order["items"]}})

    ev = p.get("events", []) + [_record_event(id, f"Plan Cancelled: {inp.reason}")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "CANCELLED",
        "current_stage": "Cancelled",
        "cancel_reason": inp.reason,
        "cancelled_at": now_iso(),
        "events": ev,
    }})
    await audit("CANCEL", "plan", id, details={"reason": inp.reason, "material_reversed": consumed})
    return {"ok": True}


# Ready plans for customer (FINISHED, not fully dispatched, not cancelled)
@api.get("/customers/{customer_id}/ready-plans")
async def customer_ready_plans(customer_id: str):
    orders = [o async for o in db.customer_orders.find({"customer_id": customer_id})]
    order_by_id = {o["id"]: o for o in orders}
    order_ids = list(order_by_id.keys())
    if not order_ids:
        return []
    plans = [clean(p) for p in await db.production_plans.find({
        "customer_order_id": {"$in": order_ids}, "status": "FINISHED",
    }).sort("created_at", 1).to_list(2000)]
    articles = {a["id"]: a for a in await _list("articles")}
    colours = {c["id"]: c for c in await _list("colours")}
    pcs = {p["id"]: p for p in await _list("plan_configurations")}
    for p in plans:
        o = order_by_id.get(p.get("customer_order_id"), {})
        p["customer_po"] = o.get("customer_po")
        p["article_name"] = articles.get(p.get("article_id"), {}).get("name")
        p["article_code"] = articles.get(p.get("article_id"), {}).get("code")
        p["colour_name"] = colours.get(p.get("colour_id"), {}).get("name") if p.get("colour_id") else None
        p["plan_config_name"] = pcs.get(p.get("plan_config_id"), {}).get("name")
    return plans


# ==================== DASHBOARD ====================
@api.get("/dashboard")
async def dashboard():
    def_count = lambda **kw: db.production_plans.count_documents(kw)
    stats = {
        "customer_orders": await db.customer_orders.count_documents({}),
        "active_plans": await db.production_plans.count_documents({"status": {"$nin": ["FINISHED", "DISPATCHED"]}}),
        "cutting_pending": await db.production_plans.count_documents({"status": "PLANNED"}),
        "cutting": await db.production_plans.count_documents({"status": "CUTTING"}),
        "printing_pending": await db.production_plans.count_documents({"status": "PRINTING"}),
        "stitching_outside": await db.production_plans.count_documents({"status": "STITCHING_OUT"}),
        "stitching_return_pending": await db.production_plans.count_documents({"status": "STITCHING_OUT"}),
        "qc_pending": await db.production_plans.count_documents({"status": "QC"}),
        "rework_pending": await db.production_plans.count_documents({"status": "REWORK"}),
        "finished_stock": await db.production_plans.count_documents({"status": "FINISHED"}),
        "dispatch_pending": await db.production_plans.count_documents({"status": "FINISHED"}),
    }

    active = [clean(p) for p in await db.production_plans.find({"status": {"$nin": ["FINISHED", "DISPATCHED"]}}).sort("created_at", -1).limit(20).to_list(20)]

    # Fabricator watch
    fab_watch = {}
    async for j in db.fabricator_jobs.find({"status": "OUTSIDE"}):
        fw = fab_watch.setdefault(j["fabricator_id"], {"fabricator_name": j["fabricator_name"], "plans_outside": 0, "qty_outside": 0})
        fw["plans_outside"] += 1
        fw["qty_outside"] += j["qty_given"] - j.get("qty_returned", 0)

    # Material requirement (top shortages)
    mr = await material_requirement()
    shortages = [m for m in mr if m["shortage"] > 0]

    recent = [clean(a) for a in await db.audit_logs.find({}).sort("at", -1).limit(15).to_list(15)]

    return {
        "stats": stats,
        "active_plans": active,
        "fabricator_watch": list(fab_watch.values()),
        "material_requirement": shortages,
        "recent_activity": recent,
    }


# ==================== REPORTS ====================
@api.get("/reports/production-summary")
async def production_summary():
    plans = [clean(p) for p in await db.production_plans.find({}).to_list(5000)]
    return {"total_plans": len(plans), "plans": plans}


@api.get("/audit-logs")
async def audit_logs(limit: int = 100):
    return [clean(a) for a in await db.audit_logs.find({}).sort("at", -1).limit(limit).to_list(limit)]


# ==================== SEED ====================
@api.post("/seed")
async def seed(force: bool = False):
    if force:
        for c in ["customers", "articles", "colours", "uoms", "materials", "material_transactions",
                  "fabricators", "workers", "plan_configurations", "component_configurations", "boms",
                  "customer_orders", "production_plans", "fabricator_jobs", "fabricator_returns",
                  "qc_records", "finished_stock_transactions", "dispatches", "audit_logs",
                  "document_sequences"]:
            await db[c].delete_many({})
    # idempotent seed - only if empty
    if await db.customers.count_documents({}) > 0:
        return {"ok": True, "note": "already seeded"}

    # Customers
    yashvi = {"id": new_id(), "name": "Yashvi Enterprises", "phone": "9876543210", "address": "Kanpur", "active": True, "created_at": now_iso()}
    ronak = {"id": new_id(), "name": "Ronak Enterprises", "phone": "9876543211", "address": "Agra", "active": True, "created_at": now_iso()}
    await db.customers.insert_many([yashvi, ronak])

    # Colours
    colours = []
    for name in ["Black", "White", "Navy", "Blue", "Cream", "Grey", "Light Grey", "Dark Grey", "Sky/Navy", "Black/Brown"]:
        c = {"id": new_id(), "name": name, "active": True, "created_at": now_iso()}
        colours.append(c)
    await db.colours.insert_many(colours)
    black_brown = next(c for c in colours if c["name"] == "Black/Brown")

    # UOMs
    for u in ["m", "pcs", "kg", "roll"]:
        await db.uoms.insert_one({"id": new_id(), "name": u, "active": True})

    # Materials
    materials = []
    for name in ["Rexine Black", "Rexine Navy", "EVA", "Lining", "Foam", "Thread", "Buckle"]:
        m = {"id": new_id(), "name": name, "code": name[:3].upper(), "uom": "m" if "Buckle" not in name else "pcs", "active": True, "created_at": now_iso()}
        materials.append(m)
    await db.materials.insert_many(materials)

    # Opening stock
    for m in materials:
        qty = 2000.0 if m["uom"] == "m" else 500.0
        await db.material_transactions.insert_one({
            "id": new_id(), "material_id": m["id"], "kind": "OPENING", "qty": qty, "signed_qty": qty,
            "remarks": "Opening stock", "at": now_iso(),
        })

    # Articles
    a02 = {"id": new_id(), "code": "02", "name": "Article 02", "active": True, "created_at": now_iso()}
    a04 = {"id": new_id(), "code": "04", "name": "Article 04", "active": True, "created_at": now_iso()}
    await db.articles.insert_many([a02, a04])

    # Plan Configurations
    men = {
        "id": new_id(), "article_id": a02["id"], "name": "Men 6-10", "active": True,
        "sizes": [{"size": "6", "pairs": 60}, {"size": "7", "pairs": 120}, {"size": "8", "pairs": 120}, {"size": "9", "pairs": 120}, {"size": "10", "pairs": 60}],
        "created_at": now_iso(),
    }
    men_a04 = {
        "id": new_id(), "article_id": a04["id"], "name": "Men 6-10", "active": True,
        "sizes": [{"size": "6", "pairs": 60}, {"size": "7", "pairs": 120}, {"size": "8", "pairs": 120}, {"size": "9", "pairs": 120}, {"size": "10", "pairs": 60}],
        "created_at": now_iso(),
    }
    kids = {
        "id": new_id(), "article_id": a04["id"], "name": "Kids 2-5", "active": True,
        "sizes": [{"size": "2", "pairs": 120}, {"size": "3", "pairs": 120}, {"size": "4", "pairs": 180}, {"size": "5", "pairs": 180}],
        "created_at": now_iso(),
    }
    await db.plan_configurations.insert_many([men, men_a04, kids])

    # Component configs (bundling for Article 04 Men 6-10)
    comp1 = {
        "id": new_id(), "article_id": a04["id"], "plan_config_id": men_a04["id"], "component": "Vamp",
        "bundles": [
            {"bundle_no": "B1", "sizes": [{"size": "6", "qty": 60}, {"size": "7", "qty": 120}], "formula": "6-7 x 1", "total": 180},
            {"bundle_no": "B2", "sizes": [{"size": "8", "qty": 120}], "formula": "8 x 1", "total": 120},
            {"bundle_no": "B3", "sizes": [{"size": "9", "qty": 120}, {"size": "10", "qty": 60}], "formula": "9-10 x 1", "total": 180},
        ],
        "sequence": 1, "active": True, "created_at": now_iso(),
    }
    comp2 = {
        "id": new_id(), "article_id": a04["id"], "plan_config_id": men_a04["id"], "component": "Haddi",
        "bundles": [
            {"bundle_no": "B1", "sizes": [{"size": "6", "qty": 60}], "formula": "6 x 1", "total": 60},
            {"bundle_no": "B2", "sizes": [{"size": "7", "qty": 120}], "formula": "7 x 1", "total": 120},
            {"bundle_no": "B3", "sizes": [{"size": "8", "qty": 120}], "formula": "8 x 1", "total": 120},
            {"bundle_no": "B4", "sizes": [{"size": "9", "qty": 120}], "formula": "9 x 1", "total": 120},
            {"bundle_no": "B5", "sizes": [{"size": "10", "qty": 60}], "formula": "10 x 1", "total": 60},
        ],
        "sequence": 2, "active": True, "created_at": now_iso(),
    }
    comp3 = {
        "id": new_id(), "article_id": a04["id"], "plan_config_id": men_a04["id"], "component": "Chidiya",
        "bundles": [
            {"bundle_no": "B1", "sizes": [{"size": s, "qty": q} for s, q in [("6", 60), ("7", 120), ("8", 120), ("9", 120), ("10", 60)]], "formula": "6-10 x 1", "total": 480},
        ],
        "sequence": 3, "active": True, "created_at": now_iso(),
    }
    await db.component_configurations.insert_many([comp1, comp2, comp3])

    # BOMs
    rex_black = next(m for m in materials if m["name"] == "Rexine Black")
    eva = next(m for m in materials if m["name"] == "EVA")
    lining = next(m for m in materials if m["name"] == "Lining")
    foam = next(m for m in materials if m["name"] == "Foam")
    thread = next(m for m in materials if m["name"] == "Thread")

    bom04 = {
        "id": new_id(), "article_id": a04["id"], "colour_id": None, "version": 1, "active": True,
        "lines": [
            {"material_id": rex_black["id"], "consumption_per_pair": 0.4, "uom": "m"},
            {"material_id": eva["id"], "consumption_per_pair": 0.15, "uom": "m"},
            {"material_id": lining["id"], "consumption_per_pair": 0.3, "uom": "m"},
            {"material_id": foam["id"], "consumption_per_pair": 0.1, "uom": "m"},
            {"material_id": thread["id"], "consumption_per_pair": 2.0, "uom": "m"},
        ],
        "created_at": now_iso(),
    }
    bom02 = {
        "id": new_id(), "article_id": a02["id"], "colour_id": None, "version": 1, "active": True,
        "lines": [
            {"material_id": rex_black["id"], "consumption_per_pair": 0.5, "uom": "m"},
            {"material_id": eva["id"], "consumption_per_pair": 0.2, "uom": "m"},
            {"material_id": lining["id"], "consumption_per_pair": 0.35, "uom": "m"},
            {"material_id": thread["id"], "consumption_per_pair": 2.5, "uom": "m"},
        ],
        "created_at": now_iso(),
    }
    await db.boms.insert_many([bom04, bom02])

    # Fabricators
    for name in ["Ravi Stitching", "Kumar Fabricator", "Sharma Works"]:
        await db.fabricators.insert_one({"id": new_id(), "name": name, "phone": "9000000000", "active": True, "created_at": now_iso()})

    # Workers
    for name, role in [("Ramesh", "Cutter"), ("Suresh", "Printer"), ("Anil", "QC")]:
        await db.workers.insert_one({"id": new_id(), "name": name, "role": role, "active": True})

    return {"ok": True}


# ==================== ROOT ====================
@api.get("/")
async def root():
    return {"app": "NAMAN UPPER", "status": "running"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
