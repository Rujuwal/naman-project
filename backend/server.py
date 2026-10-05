"""NAMAN UPPER - Upper Manufacturing Control System - Backend"""
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone, date
import os
import uuid
import logging
import base64
import json
import requests
from packing import packing_summary

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
    # Customer orders and production plans are the working references used
    # throughout the factory. Keep them short and continuous rather than
    # embedding a year in the middle of the number.
    if kind in {"CO", "PLAN"}:
        doc = await db.document_sequences.find_one_and_update(
            {"_id": kind},
            {"$inc": {"n": 1}},
            upsert=True,
            return_document=True,
        )
        return f"P-{doc['n']:04d}" if kind == "PLAN" else f"CO-{doc['n']:04d}"

    year = datetime.now(timezone.utc).year
    key = f"{kind}-{year}"
    doc = await db.document_sequences.find_one_and_update(
        {"_id": key},
        {"$inc": {"n": 1}},
        upsert=True,
        return_document=True,
    )
    if kind == "PLAN":
        return f"P/{year}/{doc['n']:02d}"
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
    current_rate: float = Field(default=0, ge=0)
    cost_method: str = "Weighted Average"
    supplier: Optional[str] = None
    reorder_level: float = Field(default=0, ge=0)
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
    pairs_per_bag: Optional[int] = Field(default=None, gt=0, strict=True)


class PlanConfigIn(BaseModel):
    article_id: str
    name: str
    sizes: List[PlanConfigSize]
    pairs_per_bag: Optional[int] = Field(default=None, gt=0, strict=True)
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
    qty: int = Field(ge=0, strict=True)


class BagIn(BaseModel):
    bag_no: str
    sizes: List[SizeQty]
    remarks: Optional[str] = None


class PackingIn(BaseModel):
    bags: List[BagIn]


class ReturnSizeResult(BaseModel):
    size: str
    good: int = Field(ge=0, strict=True)
    rework: int = Field(ge=0, strict=True)
    reject: int = Field(ge=0, strict=True)


class ReturnIn(PackingIn):
    size_results: List[ReturnSizeResult]
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


class AccountTransactionIn(BaseModel):
    """An immutable manual accounting entry. Dispatch/work entries are generated, never re-keyed."""
    party_id: str
    party_type: str = "CUSTOMER"  # CUSTOMER, FABRICATOR, WORKER, EXPENSE
    kind: str  # PAYMENT_RECEIVED, PAYMENT, ADVANCE, ADJUSTMENT, EXPENSE, CREDIT_NOTE, DEBIT_NOTE
    amount: float = Field(gt=0)
    transaction_date: Optional[str] = None
    payment_mode: Optional[str] = None
    reference_no: Optional[str] = None
    against_id: Optional[str] = None
    notes: Optional[str] = None


class RateCardIn(BaseModel):
    party_id: str
    work_type: str  # CUTTING, PRINTING, STITCHING, QC, PACKING
    rate: float = Field(ge=0)
    effective_from: str


class MonthCloseIn(BaseModel):
    month: str  # YYYY-MM


class SupplierIn(BaseModel):
    name: str
    phone: Optional[str] = None
    gstin: Optional[str] = None
    active: bool = True


class ExpenseIn(BaseModel):
    expense_date: Optional[str] = None
    category: str
    classification: str = "FACTORY_OVERHEAD"  # DIRECT_MANUFACTURING, FACTORY_OVERHEAD, ADMINISTRATION, SELLING, CAPITAL
    amount: float = Field(gt=0)
    vendor_id: Optional[str] = None
    payment_mode: str = "Cash"
    paid: bool = True
    invoice_no: Optional[str] = None
    notes: Optional[str] = None


class JournalLineIn(BaseModel):
    account_code: str
    debit: float = Field(default=0, ge=0)
    credit: float = Field(default=0, ge=0)


class JournalIn(BaseModel):
    journal_date: Optional[str] = None
    reference: Optional[str] = None
    description: str
    lines: List[JournalLineIn]


class AssistantHistoryTurn(BaseModel):
    role: str
    text: str = Field(min_length=1, max_length=6000)


class AssistantChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: List[AssistantHistoryTurn] = Field(default_factory=list, max_length=12)


class AssistantConfirmIn(BaseModel):
    action_type: str
    data: Dict[str, Any]


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

@api.post("/materials/{id}/rate")
async def record_material_rate(id: str, inp: MaterialRateIn):
    material = await db.materials.find_one({"id": id})
    if not material:
        raise HTTPException(404, "Material not found")
    await db.material_cost_history.insert_one({
        "id": new_id(), "material_id": id, "rate": inp.rate, "supplier": inp.supplier,
        "landed_qty": inp.landed_qty, "method": material.get("cost_method", "Weighted Average"), "at": now_iso(),
    })
    await db.materials.update_one({"id": id}, {"$set": {"current_rate": inp.rate, "supplier": inp.supplier or material.get("supplier"), "rate_updated_at": now_iso()}})
    await audit("MATERIAL_RATE", "material", id, details={"rate": inp.rate, "supplier": inp.supplier})
    return {"ok": True, "material_id": id, "current_rate": inp.rate}

# Fabricators
@api.get("/fabricators")
async def list_fabricators():
    return await _list("fabricators")


@api.get("/fabricators/management")
async def fabricator_management():
    """Operational workload, quality and ledger view for outsourced stitching."""
    today = datetime.now(timezone.utc).date()

    def as_date(value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except (TypeError, ValueError):
            return None

    fabricators = [clean(f) for f in await db.fabricators.find({}).to_list(2000)]
    jobs = [clean(j) for j in await db.fabricator_jobs.find({}).to_list(5000)]
    returns = [clean(r) for r in await db.fabricator_returns.find({}).to_list(5000)]
    plans = {p["id"]: clean(p) for p in await db.production_plans.find({}).to_list(5000)}
    qc_records = [clean(q) for q in await db.qc_records.find({}).to_list(5000)]

    latest_return = {}
    for ret in returns:
        previous = latest_return.get(ret["plan_id"])
        if not previous or ret.get("return_date", "") > previous.get("return_date", ""):
            latest_return[ret["plan_id"]] = ret

    quality_by_fabricator = {}
    for qc in qc_records:
        fab_id = plans.get(qc.get("plan_id"), {}).get("fabricator_id")
        if not fab_id:
            continue
        q = quality_by_fabricator.setdefault(fab_id, {"rework_pairs": 0, "held_pairs": 0, "quality_issues": 0})
        q["rework_pairs"] += qc.get("total_rework", 0)
        q["held_pairs"] += qc.get("total_hold", 0)
        q["quality_issues"] += len(qc.get("defects", []))

    result = []
    for fab in fabricators:
        fab_jobs = [j for j in jobs if j.get("fabricator_id") == fab["id"]]
        issued = sum(j.get("qty_given", 0) for j in fab_jobs)
        returned = sum(j.get("qty_returned", 0) for j in fab_jobs)
        outside = [j for j in fab_jobs if j.get("status") == "OUTSIDE"]
        pending = sum(max(0, j.get("qty_given", 0) - j.get("qty_returned", 0)) for j in outside)
        overdue = [j for j in outside if as_date(j.get("due_date")) and as_date(j["due_date"]) < today]
        turnaround_days = []
        ledger = []
        for job in sorted(fab_jobs, key=lambda j: j.get("issue_date", ""), reverse=True):
            ret = latest_return.get(job["plan_id"])
            issue_date, return_date = as_date(job.get("issue_date")), as_date(ret.get("return_date")) if ret else None
            turnaround = (return_date - issue_date).days if issue_date and return_date else None
            if turnaround is not None:
                turnaround_days.append(turnaround)
            ledger.append({
                "job_id": job["id"], "plan_id": job["plan_id"], "plan_no": job.get("plan_no"),
                "issue_date": job.get("issue_date"), "due_date": job.get("due_date"),
                "return_date": ret.get("return_date") if ret else None,
                "pairs_issued": job.get("qty_given", 0), "pairs_returned": job.get("qty_returned", 0),
                "pending_pairs": max(0, job.get("qty_given", 0) - job.get("qty_returned", 0)),
                "status": job.get("status"), "turnaround_days": turnaround,
            })
        quality = quality_by_fabricator.get(fab["id"], {"rework_pairs": 0, "held_pairs": 0, "quality_issues": 0})
        result.append({
            **fab,
            "current_work": len(outside), "plans_issued": len(fab_jobs), "pairs_issued": issued,
            "returns": sum(1 for j in fab_jobs if j.get("qty_returned", 0) > 0), "pairs_returned": returned,
            "pending_pairs": pending, "overdue_plans": len(overdue),
            "turnaround_days": round(sum(turnaround_days) / len(turnaround_days), 1) if turnaround_days else None,
            "daily_capacity": fab.get("daily_capacity"), "historical_production": returned,
            **quality, "ledger": ledger[:50],
        })
    return result

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

@api.post("/masters/elite-01/setup")
async def setup_elite_01():
    """Idempotently install the approved Elite 01, 480-pair component split."""
    article = await db.articles.find_one({"code": "ELITE-01"})
    if not article:
        article = {"id": new_id(), "code": "ELITE-01", "name": "Elite 01", "active": True, "created_at": now_iso()}
        await db.articles.insert_one(article)
    config = await db.plan_configurations.find_one({"article_id": article["id"], "name": "Men 6-10 · 480"})
    sizes = [{"size": "6", "pairs": 60}, {"size": "7", "pairs": 120}, {"size": "8", "pairs": 120}, {"size": "9", "pairs": 120}, {"size": "10", "pairs": 60}]
    if not config:
        config = {"id": new_id(), "article_id": article["id"], "name": "Men 6-10 · 480", "sizes": sizes, "active": True, "created_at": now_iso()}
        await db.plan_configurations.insert_one(config)
    size_map = {"6": 60, "7": 120, "8": 120, "9": 120, "10": 60}
    def bundles(groups):
        return [{"bundle_no": f"B{i + 1}", "sizes": [{"size": s, "qty": size_map[s]} for s in group], "total": sum(size_map[s] for s in group)} for i, group in enumerate(groups)]
    singles = [["6"], ["7"], ["8"], ["9"], ["10"]]
    all_sizes = [["6", "7", "8", "9", "10"]]
    components = [("PP Vamp", singles), ("PP Haddi", singles), ("Pingpong", all_sizes), ("Stiffner", all_sizes), ("Foam", all_sizes), ("Skinfit Collar", [["6", "7", "8"], ["9", "10"]]), ("Skinfit Tounge", all_sizes), ("Size Label", all_sizes), ("Chidiya", all_sizes), ("Tounge", all_sizes), ("Vamp", [["6", "7"], ["8"], ["9", "10"]]), ("Haddi", singles), ("Toe", [["6", "7"], ["8"], ["9", "10"]]), ("U", [["6", "7", "8"], ["9", "10"]]), ("Counter", [["6", "7", "8"], ["9", "10"]]), ("Center Patti", [["6", "7", "8"], ["9", "10"]]), ("Counter Patti", [["6", "7", "8"], ["9", "10"]]), ("Toe Patti", all_sizes)]
    created = 0
    for sequence, (name, groups) in enumerate(components, 1):
        if not await db.component_configurations.find_one({"plan_config_id": config["id"], "component": name}):
            await db.component_configurations.insert_one({"id": new_id(), "article_id": article["id"], "plan_config_id": config["id"], "component": name, "bundles": bundles(groups), "sequence": sequence, "active": True, "created_at": now_iso()})
            created += 1
    await audit("SETUP_COMPONENT_CONFIGURATION", "article", article["id"], details={"article": "Elite 01", "component_configs_created": created, "total_bundles": 39})
    return {"ok": True, "article": clean(article), "plan_config": clean(config), "component_configs_created": created, "total_bundles": 39}

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
async def sync_customer_order_status(order: dict) -> str:
    """Derive the sales-order status from its outstanding production plans."""
    plans = [p async for p in db.production_plans.find({"customer_order_id": order["id"]})]
    required_plans = sum(item.get("num_plans", 0) for item in order.get("items", []))
    generated_plans = sum(item.get("plans_generated", 0) for item in order.get("items", []))
    statuses = [plan.get("status") for plan in plans if plan.get("status") != "CANCELLED"]

    if not statuses:
        status = "PENDING PLANNING" if required_plans else "OPEN"
    elif generated_plans < required_plans:
        status = "PENDING PLANNING"
    elif any(s == "REWORK" for s in statuses):
        status = "REWORK"
    elif any(s in ("QC", "HOLD") for s in statuses):
        status = "QC PENDING"
    elif any(s in ("CUTTING", "PRINTING", "STITCHING_OUT", "STITCHING_RETURN") for s in statuses):
        status = "IN PRODUCTION"
    elif any(s == "PLANNED" for s in statuses):
        status = "PLANNED"
    elif any(s == "FINISHED" for s in statuses):
        status = "READY TO DISPATCH"
    elif statuses and all(s == "DISPATCHED" for s in statuses):
        status = "COMPLETED"
    else:
        status = "OPEN"

    if order.get("status") != status:
        await db.customer_orders.update_one({"id": order["id"]}, {"$set": {"status": status, "status_updated_at": now_iso()}})
    return status


@api.get("/customer-orders")
async def list_customer_orders():
    orders = [clean(o) for o in await db.customer_orders.find({}).sort("created_at", -1).to_list(2000)]
    for order in orders:
        order["status"] = await sync_customer_order_status(order)
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
    o = clean(o)
    o["status"] = await sync_customer_order_status(o)
    return {"order": o, "plans": plans}


# Packing rules are fixed when a return is recorded, not inferred from its row count.
async def plan_packing_rule(plan):
    pc = await db.plan_configurations.find_one({"id": plan["plan_config_id"]}) or {}
    overrides = {s["size"]: s.get("pairs_per_bag") for s in pc.get("sizes", [])}
    return {s["size"]: overrides.get(s["size"]) or pc.get("pairs_per_bag") for s in plan["sizes_snapshot"]}


async def return_packing(ret, plan):
    saved_rule = ret.get("packing_rule_snapshot")
    previous_bags = ret.get("total_bags")
    rule = saved_rule or await plan_packing_rule(plan)
    summary = packing_summary(ret["bags"], rule)
    for i, row in enumerate(ret["bags"]):
        row["serial_no"] = i + 1
        row["total"] = summary["row_totals"][i]
    ret.update(summary)
    # Never overwrite source-row dispatch flags while enriching a read response.
    if not summary["packing_error"] and (not saved_rule or previous_bags != summary["total_bags"]):
        await db.fabricator_returns.update_one({"id": ret["id"]}, {"$set": {
            **summary, "total_bag_pairs": summary["total_pairs"],
        }})
    return ret


async def ensure_qc_ticket(plan, return_id):
    if plan.get("pending_qc"):
        return plan["pending_qc"]
    ticket = {"id": new_id(), "inspection_date": now_iso(), "return_id": return_id}
    updated = await db.production_plans.find_one_and_update(
        {"id": plan["id"], "pending_qc": None}, {"$set": {"pending_qc": ticket}}, return_document=True)
    if updated:
        return updated["pending_qc"]
    current = await db.production_plans.find_one({"id": plan["id"]})
    return current["pending_qc"]


async def attach_plan_dates(plans):
    by_id = {p["id"]: p for p in plans}
    for p in plans:
        pending = p.get("pending_qc") or {}
        p["qc_date"] = pending.get("inspection_date")
        p["dispatch_date"] = None
    async for q in db.qc_records.find({"plan_id": {"$in": list(by_id)}}).sort("inspection_date", -1):
        p = by_id[q["plan_id"]]
        if not p["qc_date"]:
            p["qc_date"] = q["inspection_date"]
    async for d in db.dispatches.find({"plan_ids": {"$in": list(by_id)}, "status": "DISPATCHED"}).sort("dispatch_date", -1):
        for pid in d["plan_ids"]:
            if pid in by_id and not by_id[pid]["dispatch_date"]:
                by_id[pid]["dispatch_date"] = d["dispatch_date"]
    return plans


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
    return await attach_plan_dates(plans)


@api.get("/plans/{id}")
async def get_plan(id: str):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    p = clean(p)
    # attach related docs
    p["fabricator_jobs"] = [clean(x) for x in await db.fabricator_jobs.find({"plan_id": id}).to_list(100)]
    p["returns"] = [await return_packing(clean(x), p) for x in await db.fabricator_returns.find({"plan_id": id}).sort("return_date", 1).to_list(100)]
    p["qc_records"] = [clean(x) for x in await db.qc_records.find({"plan_id": id}).sort("inspection_date", 1).to_list(100)]
    # The stitching slip must always receive the same component details that
    # were issued with the plan.  Older plans fall back to the active master.
    p["component_configs"] = p.get("component_configs_snapshot") or [clean(c) for c in await db.component_configurations.find({"plan_config_id": p["plan_config_id"], "active": {"$ne": False}}).sort("sequence", 1).to_list(200)]
    p["packing_rule"] = await plan_packing_rule(p)
    await attach_plan_dates([p])
    return p


@api.post("/plans/{id}/packing-preview")
async def preview_packing(id: str, inp: PackingIn):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    return packing_summary([b.model_dump() for b in inp.bags], await plan_packing_rule(p))


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
            # Snapshot the rate on issue. Historical plan/article costing must
            # never be recomputed at today's material master rate.
            "unit_rate": (await db.materials.find_one({"id": d["material_id"]}) or {}).get("current_rate", 0),
            "kind": "MATERIAL_CONSUMPTION",
            "qty": d["qty"],
            "signed_qty": -d["qty"],
            "plan_id": id,
            "at": now_iso(),
            "remarks": f"Cutting Plan {p['plan_no']}",
        })

    # Snapshot BOM on plan
    ev = p.get("events", []) + [_record_event(id, "Cutting Started")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "CUTTING",
        "current_stage": "Cutting",
        "bom_snapshot": bom,
        "cutting_started_at": now_iso(),
        "events": ev,
    }})
    await audit("START_CUTTING", "plan", id, details={"deductions": deductions})
    return {"ok": True, "plan_no": p["plan_no"], "deductions": deductions}


@api.post("/plans/{id}/issue-to-printing")
async def issue_to_printing(id: str):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] != "CUTTING":
        raise HTTPException(400, f"Plan must be in CUTTING; current: {p['status']}")
    ev = p.get("events", []) + [_record_event(id, "Issued to Printing")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "PRINTING", "current_stage": "Printing",
        "printing_started_at": now_iso(),
        "events": ev,
    }})
    await audit("ISSUE_TO_PRINTING", "plan", id)
    return {"ok": True, "plan_no": p["plan_no"]}


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

    component_snapshot = [clean(c) for c in await db.component_configurations.find({"plan_config_id": p["plan_config_id"], "active": {"$ne": False}}).sort("sequence", 1).to_list(200)]
    job = {
        "id": new_id(),
        "plan_id": id,
        "plan_no": p["plan_no"],
        "fabricator_id": inp.fabricator_id,
        "fabricator_name": fab["name"],
        "issue_date": now_iso(),
        "due_date": inp.due_date,
        "instructions": inp.instructions,
        "qty_given": p["qty"],
        "qty_returned": 0,
        "component_configs_snapshot": component_snapshot,
        "status": "OUTSIDE",
    }
    await db.fabricator_jobs.insert_one(job)
    ev = p.get("events", []) + [_record_event(id, "Issued to Fabricator")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "STITCHING_OUT", "current_stage": "Stitching Out",
        "fabricator_id": inp.fabricator_id,
        "fabricator_name": fab["name"],
        "stitching_started_at": now_iso(),
        "component_configs_snapshot": component_snapshot,
        "events": ev,
    }})
    await audit("ISSUE_TO_FABRICATOR", "plan", id, details={"fabricator": fab["name"]})
    return {"ok": True, "plan_no": p["plan_no"]}


@api.post("/plans/{id}/receive-stitching")
async def receive_stitching(id: str, inp: ReturnIn):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] not in ("STITCHING_OUT",):
        raise HTTPException(400, f"Plan must be in STITCHING_OUT; current: {p['status']}")

    plan_sizes = {s["size"]: s["pairs"] for s in p["sizes_snapshot"]}
    summary = packing_summary([b.model_dump() for b in inp.bags], await plan_packing_rule(p))
    if summary["packing_error"]:
        raise HTTPException(400, summary["packing_error"])
    if not inp.bags or any(total == 0 for total in summary["row_totals"]):
        raise HTTPException(400, "Each packing row must contain at least one pair")
    returned = {}
    for sr in inp.size_results:
        if sr.size not in plan_sizes or sr.size in returned:
            raise HTTPException(400, "Return sizes must be unique and match the plan")
        returned[sr.size] = sr.good + sr.rework + sr.reject
    for size, limit in plan_sizes.items():
        if returned.get(size, 0) != summary["size_totals"][size]:
            raise HTTPException(400, f"Size {size}: packing quantity must equal Good + Rework + Reject")
        if summary["size_totals"][size] > limit:
            raise HTTPException(400, f"Packing totals for size {size} exceed plan size ({limit})")
    total_returned = sum(returned.values())

    doc = {
        "id": new_id(),
        "plan_id": id,
        "plan_no": p["plan_no"],
        "fabricator_id": p.get("fabricator_id"),
        "fabricator_name": p.get("fabricator_name"),
        "return_date": now_iso(),
        "bags": [{"bag_no": str(i + 1), "serial_no": i + 1, "sizes": [s.model_dump() for s in b.sizes],
                  "total": summary["row_totals"][i], "remarks": b.remarks,
                  "dispatched": False} for i, b in enumerate(inp.bags)],
        "size_results": [sr.model_dump() for sr in inp.size_results],
        "total_returned": total_returned,
        **summary,
        "total_bag_pairs": summary["total_pairs"],
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
    ticket = await ensure_qc_ticket(p, doc["id"])
    await audit("RECEIVE_STITCHING", "plan", id, details={"returned": total_returned})
    return {"ok": True, "plan_no": p["plan_no"], **summary, "pending_qc": ticket}


@api.post("/plans/{id}/qc")
async def do_qc(id: str, inp: QCIn):
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] not in ("QC", "REWORK"):
        raise HTTPException(400, f"Plan must be in QC; current: {p['status']}")

    # Every received pair must be accounted for once in QC. On a re-inspection,
    # qc_expected_by_size contains only the pairs returned after rework.
    ret = await db.fabricator_returns.find_one({"plan_id": id}, sort=[("return_date", -1)])
    if not ret:
        raise HTTPException(400, "No stitching return found for QC")
    ret_by_size = {sr["size"]: sr.get("good", 0) + sr.get("rework", 0) for sr in ret["size_results"]}
    expected_by_size = p.get("qc_expected_by_size") or ret_by_size
    entered_sizes = set()
    total_pass = 0
    total_rework = 0
    total_hold = 0
    for sr in inp.size_results:
        if sr.size not in expected_by_size or sr.size in entered_sizes:
            raise HTTPException(400, "QC sizes must be unique and match the received quantities")
        entered_sizes.add(sr.size)
        s_total = sr.passed + sr.rework + sr.hold
        if s_total != expected_by_size[sr.size]:
            raise HTTPException(400, f"Size {sr.size} QC total ({s_total}) must equal received quantity ({expected_by_size[sr.size]})")
        total_pass += sr.passed
        total_rework += sr.rework
        total_hold += sr.hold
    if entered_sizes != set(expected_by_size):
        raise HTTPException(400, "Enter QC results for every received size")

    ticket = await ensure_qc_ticket(p, ret["id"])
    doc = {
        "id": ticket["id"],
        "plan_id": id,
        "plan_no": p["plan_no"],
        "return_id": ret["id"],
        "inspection_date": ticket["inspection_date"],
        "completed_at": now_iso(),
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
    elif total_hold > 0:
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
    }, "$unset": {"pending_qc": "", "qc_expected_by_size": ""}})
    await audit("QC", "plan", id, details={"pass": total_pass, "rework": total_rework, "hold": total_hold})
    return {"ok": True, "plan_no": p["plan_no"], "status": new_status}


@api.get("/qc-records/{id}")
async def get_qc_record(id: str):
    q = await db.qc_records.find_one({"id": id})
    if not q:
        raise HTTPException(404, "QC record not found")
    return {"qc": clean(q), "plan": await get_plan(q["plan_id"])}


class ReworkReturnIn(BaseModel):
    remarks: Optional[str] = None


@api.post("/plans/{id}/rework-return")
async def rework_return(id: str, inp: ReworkReturnIn):
    """Rework corrected → back to QC."""
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] not in ("REWORK", "HOLD"):
        raise HTTPException(400, f"Plan must be in REWORK or HOLD; current: {p['status']}")
    ret = await db.fabricator_returns.find_one({"plan_id": id}, sort=[("return_date", -1)])
    if not ret:
        raise HTTPException(400, "No stitching return found for QC")
    latest_qc = await db.qc_records.find_one({"plan_id": id}, sort=[("inspection_date", -1)])
    if not latest_qc:
        raise HTTPException(400, "No QC record found")
    expected_by_size = {
        sr["size"]: sr.get("rework", 0) + sr.get("hold", 0)
        for sr in latest_qc.get("size_results", [])
        if sr.get("rework", 0) + sr.get("hold", 0) > 0
    }
    if not expected_by_size:
        raise HTTPException(400, "There are no outstanding QC pairs to re-inspect")
    await ensure_qc_ticket(p, ret["id"])
    ev = p.get("events", []) + [_record_event(id, "Returned to QC for Re-inspection")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "QC", "current_stage": "QC", "qc_expected_by_size": expected_by_size, "events": ev,
    }})
    return {"ok": True}


class CloseRejectedIn(BaseModel):
    remarks: Optional[str] = None


class MaterialRateIn(BaseModel):
    rate: float = Field(ge=0)
    supplier: Optional[str] = None
    landed_qty: Optional[float] = Field(default=None, gt=0)


@api.post("/plans/{id}/close-rejected")
async def close_rejected(id: str, inp: CloseRejectedIn):
    """Close QC rework/hold as rejected; passed stock remains dispatchable."""
    p = await db.production_plans.find_one({"id": id})
    if not p:
        raise HTTPException(404, "Plan not found")
    if p["status"] not in ("REWORK", "HOLD"):
        raise HTTPException(400, f"Plan must be in REWORK or HOLD; current: {p['status']}")

    latest_qc = await db.qc_records.find_one({"plan_id": id}, sort=[("inspection_date", -1)])
    if not latest_qc:
        raise HTTPException(400, "No QC record found")
    rejected_qty = latest_qc.get("total_rework", 0) + latest_qc.get("total_hold", 0)
    ev = p.get("events", []) + [_record_event(id, f"QC outstanding pairs closed as rejected ({rejected_qty})")]
    await db.production_plans.update_one({"id": id}, {"$set": {
        "status": "FINISHED",
        "current_stage": "Finished Stock",
        "qc_rejected_qty": rejected_qty,
        "qc_rejection_remarks": inp.remarks,
        "events": ev,
    }})
    await audit("CLOSE_QC_REJECTED", "plan", id, details={"rejected_qty": rejected_qty, "remarks": inp.remarks})
    return {"ok": True, "plan_no": p["plan_no"], "rejected_qty": rejected_qty, "status": "FINISHED"}


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
async def dispatch_packing(doc):
    groups = {}
    rows = []
    for row in doc["bags"]:
        rid = row["return_id"]
        if rid not in groups:
            ret = await db.fabricator_returns.find_one({"id": rid})
            plan = await db.production_plans.find_one({"id": row["plan_id"]})
            ret = await return_packing(clean(ret), plan)
            groups[rid] = {"return_id": rid,
                           "plan_id": plan["id"], "plan_no": plan["plan_no"],
                           "article_id": plan["article_id"], "colour_id": plan.get("colour_id"),
                           "plan_config_id": plan["plan_config_id"], "plan_config_name": plan["plan_config_name"],
                           "packing_rule_snapshot": ret["packing_rule_snapshot"], "bags": []}
        group = groups[rid]
        group["bags"].append(row)
        rows.append(row)
    size_totals = {}
    errors = []
    for group in groups.values():
        summary = packing_summary(group["bags"], group["packing_rule_snapshot"])
        group.update(summary)
        for i, row in enumerate(group["bags"]):
            row["total"] = summary["row_totals"][i]
        if summary["packing_error"]:
            errors.append(f"{group['plan_no']}: {summary['packing_error']}")
        for size, qty in summary["size_totals"].items():
            size_totals[size] = size_totals.get(size, 0) + qty
    return {"bags": rows, "packing_groups": list(groups.values()), "packing_row_count": len(rows),
            "total_pairs": sum(g["total_pairs"] for g in groups.values()),
            "total_bags": None if errors else sum(g["total_bags"] for g in groups.values()),
            "size_totals": size_totals, "packing_error": "; ".join(errors) if errors else None}


@api.get("/dispatches")
async def list_dispatches(status: Optional[str] = None):
    q = {"status": status} if status else {}
    docs = [clean(d) for d in await db.dispatches.find(q).sort("created_at", -1).to_list(2000)]
    for d in docs:
        d.update(await dispatch_packing(d))
    return docs


@api.get("/dispatches/{id}")
async def get_dispatch(id: str):
    d = await db.dispatches.find_one({"id": id})
    if not d:
        raise HTTPException(404, "Dispatch not found")
    d = clean(d)
    d.update(await dispatch_packing(d))
    return d


@api.get("/available-bags")
async def available_bags(plan_ids: str):
    """Original undispatched packing rows; bag_no is an internal source-row reference."""
    ids = [x.strip() for x in plan_ids.split(",") if x.strip()]
    rows = []
    for pid in ids:
        plan = await db.production_plans.find_one({"id": pid})
        if not plan or plan["status"] != "FINISHED":
            continue
        async for source in db.fabricator_returns.find({"plan_id": pid}).sort("return_date", 1):
            ret = await return_packing(clean(source), plan)
            for row in ret["bags"]:
                if not row.get("dispatched"):
                    rows.append({"return_id": ret["id"],
                                 "plan_id": pid, "plan_no": plan["plan_no"],
                                 "fabricator_name": ret.get("fabricator_name"), **row})
    return rows


@api.get("/ready-plans")
async def all_ready_plans():
    """All dispatchable plans, enriched with their source CO and customer."""
    orders = {o["id"]: clean(o) for o in await db.customer_orders.find({}).to_list(5000)}
    customers = {c["id"]: clean(c) for c in await db.customers.find({}).to_list(5000)}
    articles = {a["id"]: a for a in await _list("articles")}
    colours = {c["id"]: c for c in await _list("colours")}
    configs = {c["id"]: c for c in await _list("plan_configurations")}
    plans = [clean(p) for p in await db.production_plans.find({"status": "FINISHED"}).sort("created_at", 1).to_list(5000)]
    for p in plans:
        order = orders.get(p.get("customer_order_id"), {})
        source_customer = customers.get(order.get("customer_id"), {})
        p["co_no"] = order.get("co_no")
        p["customer_po"] = order.get("customer_po")
        p["source_customer_id"] = order.get("customer_id")
        p["source_customer_name"] = source_customer.get("name")
        p["article_name"] = articles.get(p.get("article_id"), {}).get("name")
        p["article_code"] = articles.get(p.get("article_id"), {}).get("code")
        p["colour_name"] = colours.get(p.get("colour_id"), {}).get("name") if p.get("colour_id") else None
        p["plan_config_name"] = configs.get(p.get("plan_config_id"), {}).get("name")
    return plans


async def prepare_dispatch(inp):
    if not inp.plan_ids or len(inp.plan_ids) != len(set(inp.plan_ids)):
        raise HTTPException(400, "Select unique plans")
    if not await db.customers.find_one({"id": inp.customer_id}):
        raise HTTPException(400, "Dispatch recipient customer not found")
    plans_data = []
    for pid in inp.plan_ids:
        p = await db.production_plans.find_one({"id": pid})
        if not p or p["status"] != "FINISHED":
            raise HTTPException(400, "Selected plans must be in Finished Stock")
        order = await db.customer_orders.find_one({"id": p["customer_order_id"]})
        if not order:
            raise HTTPException(400, "Source customer order not found")
        plans_data.append(p)
    if not inp.bags:
        raise HTTPException(400, "Select packing rows")
    seen = set()
    rows = []
    for ref in inp.bags:
        key = (ref.return_id, ref.bag_no)
        if key in seen:
            raise HTTPException(400, "A packing row cannot be selected twice")
        seen.add(key)
        ret = await db.fabricator_returns.find_one({"id": ref.return_id})
        if not ret or ret["plan_id"] not in inp.plan_ids:
            raise HTTPException(400, "Packing row does not belong to the selected plans")
        plan = next(p for p in plans_data if p["id"] == ret["plan_id"])
        target = next((b for b in ret["bags"] if b["bag_no"] == ref.bag_no), None)
        if not target or target.get("dispatched"):
            raise HTTPException(400, "Packing row is missing or already dispatched")
        serial = next(i + 1 for i, b in enumerate(ret["bags"]) if b["bag_no"] == ref.bag_no)
        rows.append({"return_id": ref.return_id,
                     "plan_id": plan["id"], "plan_no": plan["plan_no"],
                     "article_id": plan["article_id"], "colour_id": plan.get("colour_id"),
                     "plan_config_id": plan["plan_config_id"], "fabricator_name": ret.get("fabricator_name"),
                     "bag_no": ref.bag_no, "serial_no": serial,
                     "sizes": target["sizes"], "total": sum(s["qty"] for s in target["sizes"])})
    if set(inp.plan_ids) != {r["plan_id"] for r in rows}:
        raise HTTPException(400, "Select at least one packing row from each selected plan")
    rows.sort(key=lambda r: (inp.plan_ids.index(r["plan_id"]), r["return_id"], r["serial_no"]))
    summary = await dispatch_packing({"bags": rows})
    if summary["packing_error"]:
        raise HTTPException(400, summary["packing_error"])
    # Validate the entire selection before writing any stock deductions.
    requirements = {}
    for row in rows:
        for cell in row["sizes"]:
            key = (row["plan_id"], cell["size"])
            requirements[key] = requirements.get(key, 0) + cell["qty"]
    for (pid, size), qty in requirements.items():
        current = 0
        async for tx in db.finished_stock_transactions.find({"plan_id": pid, "size": size}):
            current += tx["signed_qty"]
        if current < qty:
            raise HTTPException(400, f"Insufficient QC-passed finished stock for size {size} (have {current}, need {qty})")
    return plans_data, summary


@api.post("/dispatches/preview")
async def preview_dispatch(inp: DispatchIn):
    _, summary = await prepare_dispatch(inp)
    return summary


@api.post("/dispatches")
async def create_dispatch(inp: DispatchIn):
    plans_data, summary = await prepare_dispatch(inp)
    recipient = await db.customers.find_one({"id": inp.customer_id})
    customer_order_ids = list({p["customer_order_id"] for p in plans_data})
    bag_details = summary["bags"]
    dsp_no = await next_seq("DSP", "DSP")

    # All selected rows have been validated before any stock write.
    for b in bag_details:
        pid = b["plan_id"]
        for s in b["sizes"]:
            await db.finished_stock_transactions.insert_one({
                "id": new_id(), "plan_id": pid, "plan_no": b["plan_no"],
                "size": s["size"], "qty": s["qty"], "signed_qty": -s["qty"],
                "kind": "DISPATCH", "dispatch_no": dsp_no, "at": now_iso(),
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

    # A plan may be shipped to a different customer than the customer that
    # placed its source CO. When the full plan is dispatched this way, replace
    # it on the source CO so that customer's production requirement remains
    # pending instead of being treated as fulfilled.
    replacement_plan_nos = []
    for source_plan in plans_data:
        source_order = await db.customer_orders.find_one({"id": source_plan["customer_order_id"]})
        dispatched_plan = await db.production_plans.find_one({"id": source_plan["id"]})
        if (not source_order or source_order.get("customer_id") == inp.customer_id
                or not dispatched_plan or dispatched_plan.get("status") != "DISPATCHED"):
            continue
        replacement_no = await next_seq("PLAN", "PLAN")
        replacement = {
            "id": new_id(), "plan_no": replacement_no, "plan_date": now_iso(),
            "customer_order_id": source_plan["customer_order_id"], "co_no": source_plan["co_no"],
            "order_item_id": source_plan["order_item_id"], "article_id": source_plan["article_id"],
            "colour_id": source_plan.get("colour_id"), "plan_config_id": source_plan["plan_config_id"],
            "plan_config_name": source_plan["plan_config_name"], "sizes_snapshot": source_plan["sizes_snapshot"],
            "qty": source_plan["qty"], "due_date": source_plan.get("due_date"),
            "priority": source_plan.get("priority", "Normal"), "status": "PLANNED",
            "current_stage": "Planned", "dispatched_qty": 0, "qc_passed_by_size": {},
            "replaces_plan_id": source_plan["id"],
            "events": [{"at": now_iso(), "action": f"Replacement for cross-customer dispatch to {recipient.get('name', 'customer')}", "user": "system"}],
            "created_at": now_iso(),
        }
        await db.production_plans.insert_one(replacement)
        await db.production_plans.update_one({"id": source_plan["id"]}, {"$set": {
            "reallocated_to_customer_id": inp.customer_id,
            "reallocated_to_customer_name": recipient.get("name"),
            "replacement_plan_id": replacement["id"],
        }})
        await audit("CROSS_CUSTOMER_DISPATCH", "plan", source_plan["id"], details={
            "recipient_customer_id": inp.customer_id, "replacement_plan_no": replacement_no,
        })
        replacement_plan_nos.append(replacement_no)

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
        "replacement_plan_nos": replacement_plan_nos,
        "plan_ids": inp.plan_ids,
        **summary,
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


@api.get("/customer-orders/{order_id}/ready-plans")
async def customer_order_ready_plans(order_id: str):
    """Finished plans from one source customer order, for dispatch to any recipient."""
    order = await db.customer_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Customer order not found")
    plans = [clean(p) for p in await db.production_plans.find({
        "customer_order_id": order_id, "status": "FINISHED",
    }).sort("created_at", 1).to_list(2000)]
    articles = {a["id"]: a for a in await _list("articles")}
    colours = {c["id"]: c for c in await _list("colours")}
    pcs = {p["id"]: p for p in await _list("plan_configurations")}
    for p in plans:
        p["customer_po"] = order.get("customer_po")
        p["article_name"] = articles.get(p.get("article_id"), {}).get("name")
        p["article_code"] = articles.get(p.get("article_id"), {}).get("code")
        p["colour_name"] = colours.get(p.get("colour_id"), {}).get("name") if p.get("colour_id") else None
        p["plan_config_name"] = pcs.get(p.get("plan_config_id"), {}).get("name")
    return plans


# ==================== DASHBOARD ====================
@api.get("/dashboard")
async def dashboard():
    today = datetime.now(timezone.utc).date()

    def plan_date(value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except (TypeError, ValueError):
            return None

    all_plans = [clean(p) for p in await db.production_plans.find({}).to_list(5000)]
    open_statuses = {"PLANNED", "CUTTING", "PRINTING", "STITCHING_OUT", "STITCHING_RETURN", "QC", "REWORK", "HOLD"}
    active_plan_rows = [p for p in all_plans if p.get("status") in open_statuses]
    stats = {
        "customer_orders": await db.customer_orders.count_documents({}),
        "active_plans": len(active_plan_rows),
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

    active = sorted(active_plan_rows, key=lambda p: p.get("created_at", ""), reverse=True)[:20]

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

    # Command-center metrics: calculated only from operational data captured by
    # the application. Metrics with no source data are explicitly unavailable.
    today_production = sum(p.get("qty", 0) for p in all_plans if plan_date(p.get("cutting_started_at")) == today)
    dispatches = [clean(d) for d in await db.dispatches.find({"status": "DISPATCHED"}).to_list(5000)]
    today_dispatch = sum(d.get("total_pairs", 0) for d in dispatches if plan_date(d.get("dispatch_date")) == today)
    orders = [clean(o) for o in await db.customer_orders.find({}).to_list(5000)]
    pending_order_items = sum(
        max(0, item.get("num_plans", 0) - item.get("plans_generated", 0))
        for order in orders for item in order.get("items", [])
    )
    overdue = [p for p in active_plan_rows if plan_date(p.get("due_date")) and plan_date(p["due_date"]) < today]
    stage_counts = {}
    for p in active_plan_rows:
        stage = p.get("current_stage") or p.get("status", "Unknown")
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
    bottleneck_stage, bottleneck_count = max(stage_counts.items(), key=lambda item: item[1], default=("None", 0))
    qc_records = [clean(q) for q in await db.qc_records.find({}).to_list(5000)]
    total_inspected = sum(q.get("total_pass", 0) + q.get("total_rework", 0) + q.get("total_hold", 0) for q in qc_records)
    total_passed = sum(q.get("total_pass", 0) for q in qc_records)
    efficiency = round((total_passed / total_inspected) * 100, 1) if total_inspected else None
    delivered_with_due = [p for p in all_plans if p.get("status") == "DISPATCHED" and plan_date(p.get("due_date"))]
    on_time = sum(1 for p in delivered_with_due if plan_date(p.get("dispatch_date")) and plan_date(p["dispatch_date"]) <= plan_date(p["due_date"]))
    on_time_delivery = round((on_time / len(delivered_with_due)) * 100, 1) if delivered_with_due else None

    actions = []
    for p in overdue[:8]:
        actions.append({"kind": "OVERDUE", "severity": "critical", "plan_id": p["id"], "title": f"{p['plan_no']} is overdue", "detail": f"Due {p.get('due_date', '')[:10]} · {p.get('current_stage', p.get('status'))}"})
    for m in shortages[:8]:
        actions.append({"kind": "MATERIAL", "severity": "critical", "title": f"Material shortage: {m['material_name']}", "detail": f"Short by {m['shortage']} {m.get('uom', '')}"})
    if stats["qc_pending"]:
        actions.append({"kind": "QC", "severity": "warning", "title": f"{stats['qc_pending']} plan(s) waiting for QC", "detail": "Complete inspection to release finished stock."})
    if stats["rework_pending"]:
        actions.append({"kind": "REWORK", "severity": "warning", "title": f"{stats['rework_pending']} plan(s) need rework decision", "detail": "Reinspect or close rejected pairs."})
    if bottleneck_count:
        actions.append({"kind": "BOTTLENECK", "severity": "info", "title": f"Bottleneck: {bottleneck_stage}", "detail": f"{bottleneck_count} active plan(s) at this stage."})

    command_center = {
        "today_production": today_production,
        "today_dispatch": today_dispatch,
        "pending_orders": pending_order_items,
        "wip_pairs": sum(p.get("qty", 0) for p in active_plan_rows),
        "bottleneck": {"stage": bottleneck_stage, "plans": bottleneck_count},
        "overdue_plans": len(overdue),
        "material_shortages": len(shortages),
        "qc_pending": stats["qc_pending"],
        "machine_downtime_minutes": None,
        "production_efficiency": efficiency,
        "cost_per_pair": None,
        "on_time_delivery": on_time_delivery,
    }

    return {
        "stats": stats,
        "active_plans": active,
        "fabricator_watch": list(fab_watch.values()),
        "material_requirement": shortages,
        "recent_activity": recent,
        "command_center": command_center,
        "action_required": actions,
    }


_ASSISTANT_SYSTEM = """You are the Naman Upper Factory OS agent. Answer factory questions and prepare one fully specified action only when all required data is available. Never claim an action happened: every action requires the user's explicit Confirm click. Reply strictly as JSON: {\"reply\": string, \"proposed_action\": {\"type\": string, \"data\": object}|null}. Supported action types: SETUP_ELITE_01, CREATE_CUSTOMER, CREATE_ARTICLE, CREATE_COLOUR, CREATE_MATERIAL, CREATE_FABRICATOR, CREATE_WORKER, CREATE_SUPPLIER, ACCOUNT_TRANSACTION, EXPENSE, FABRICATOR_RETURN, QC_ENTRY, START_CUTTING, ISSUE_TO_PRINTING, CREATE_DISPATCH. For FABRICATOR_RETURN, include plan_id and return data with complete packing bags and size_results. If anything required is missing, ask a short question instead of proposing an action. For purchase bills, extract supplier_name, invoice_no, invoice_date, line_items (name, qty, rate, amount), tax, freight and total; do not post a purchase automatically."""


def _openai_response(input_items: list) -> dict:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, "AI assistant is not configured. Add OPENAI_API_KEY to the backend deployment environment.")
    response = requests.post("https://api.openai.com/v1/responses", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json={"model": os.getenv("OPENAI_ASSISTANT_MODEL", "gpt-4.1"), "input": [{"role": "system", "content": [{"type": "input_text", "text": _ASSISTANT_SYSTEM}]}, *input_items], "store": False}, timeout=60)
    if not response.ok:
        log.error("OpenAI assistant error %s: %s", response.status_code, response.text[:500])
        raise HTTPException(502, "The AI service could not complete this request")
    text = response.json().get("output_text", "")
    try:
        return json.loads(text.strip().removeprefix("```json").removesuffix("```").strip())
    except (json.JSONDecodeError, AttributeError):
        return {"reply": text or "I could not interpret that response.", "proposed_action": None}


@api.post("/assistant/chat")
async def assistant_chat(inp: AssistantChatIn):
    # Supply a bounded live operating snapshot, so questions are grounded in
    # this factory's data rather than generic model knowledge.
    plans = [clean(p) for p in await db.production_plans.find({}).sort("created_at", -1).limit(100).to_list(100)]
    context = {
        "dashboard": await dashboard(),
        "customers": [{"id": c["id"], "name": c["name"]} for c in await db.customers.find({}).to_list(500)],
        "fabricators": [{"id": f["id"], "name": f["name"]} for f in await db.fabricators.find({}).to_list(500)],
        "recent_plans": [{"id": p["id"], "plan_no": p.get("plan_no"), "status": p.get("status"), "qty": p.get("qty"), "fabricator": p.get("fabricator_name")} for p in plans],
    }
    history = [{"role": "assistant" if t.role == "assistant" else "user", "content": [{"type": "input_text", "text": t.text}]} for t in inp.history[-12:]]
    result = _openai_response([{"role": "user", "content": [{"type": "input_text", "text": f"Live factory context (use only for this reply): {json.dumps(context, default=str)}"}]}, *history, {"role": "user", "content": [{"type": "input_text", "text": inp.message}]}])
    await audit("ASSISTANT_CHAT", "assistant", new_id(), details={"has_action": bool(result.get("proposed_action"))})
    return result


@api.post("/assistant/purchase-bill")
async def assistant_purchase_bill(file: UploadFile = File(...)):
    data = await file.read()
    if not data or len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "Upload a bill smaller than 15 MB")
    content_type = file.content_type or "application/octet-stream"
    if content_type.startswith("image/"):
        item = {"type": "input_image", "image_url": f"data:{content_type};base64,{base64.b64encode(data).decode()}"}
    else:
        item = {"type": "input_file", "filename": file.filename or "purchase-bill", "file_data": f"data:{content_type};base64,{base64.b64encode(data).decode()}", "detail": "high"}
    result = _openai_response([{"role": "user", "content": [item, {"type": "input_text", "text": "Read this purchase bill and prepare a reviewable purchase-bill draft."}]}])
    await audit("ASSISTANT_BILL_SCAN", "assistant", new_id(), details={"filename": file.filename})
    return result


@api.post("/assistant/confirm")
async def assistant_confirm(inp: AssistantConfirmIn):
    """Single, audited side-effect boundary for every agent proposal."""
    actions = {
        "SETUP_ELITE_01": lambda d: setup_elite_01(),
        "CREATE_CUSTOMER": lambda d: create_customer(CustomerIn(**d)),
        "CREATE_ARTICLE": lambda d: create_article(ArticleIn(**d)),
        "CREATE_COLOUR": lambda d: create_colour(ColourIn(**d)),
        "CREATE_MATERIAL": lambda d: create_material(MaterialIn(**d)),
        "CREATE_FABRICATOR": lambda d: create_fabricator(FabricatorIn(**d)),
        "CREATE_WORKER": lambda d: create_worker(WorkerIn(**d)),
        "CREATE_SUPPLIER": lambda d: create_supplier(SupplierIn(**d)),
        "ACCOUNT_TRANSACTION": lambda d: create_account_transaction(AccountTransactionIn(**d)),
        "EXPENSE": lambda d: create_expense(ExpenseIn(**d)),
        "FABRICATOR_RETURN": lambda d: receive_stitching(d["plan_id"], ReturnIn(**d["return"])),
        "QC_ENTRY": lambda d: do_qc(d["plan_id"], QCIn(**d["qc"])),
        "START_CUTTING": lambda d: start_cutting(d["plan_id"]),
        "ISSUE_TO_PRINTING": lambda d: issue_to_printing(d["plan_id"]),
        "CREATE_DISPATCH": lambda d: create_dispatch(DispatchIn(**d)),
    }
    handler = actions.get(inp.action_type)
    if not handler:
        raise HTTPException(400, "This proposed action is not yet supported")
    try:
        result = await handler(inp.data)
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, f"Incomplete assistant action: {exc}")
    await audit("ASSISTANT_CONFIRMED", "assistant", new_id(), details={"action_type": inp.action_type})
    return {"ok": True, "action_type": inp.action_type, "result": result}


# ==================== REPORTS ====================
def _as_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except (ValueError, TypeError):
        try:
            return date.fromisoformat(value[:10])
        except (ValueError, TypeError):
            return None


def _period_bounds(month: Optional[str], start: Optional[str], end: Optional[str]):
    if start or end:
        return _as_date(start) or date.min, _as_date(end) or date.max
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        year, mon = map(int, month.split("-"))
        first = date(year, mon, 1)
        following = date(year + (mon == 12), 1 if mon == 12 else mon + 1, 1)
        return first, date.fromordinal(following.toordinal() - 1)
    except ValueError:
        raise HTTPException(400, "month must be YYYY-MM")


def _in_period(value, start, end):
    value = _as_date(value)
    return value is not None and start <= value <= end


async def _assert_month_open(value: Optional[str]):
    d = _as_date(value) or datetime.now(timezone.utc).date()
    if await db.month_closings.find_one({"month": d.strftime("%Y-%m")}):
        raise HTTPException(400, "This month is closed. Post an explicit adjustment in an open month instead.")


async def _party_name(party_id: str, party_type: str):
    collection = "customers" if party_type == "CUSTOMER" else ("fabricators" if party_type == "FABRICATOR" else ("suppliers" if party_type == "SUPPLIER" else "workers"))
    party = await db[collection].find_one({"id": party_id})
    return party.get("name", party_id) if party else party_id


@api.post("/accounts/transactions")
async def create_account_transaction(inp: AccountTransactionIn):
    tx_date = inp.transaction_date or now_iso()
    await _assert_month_open(tx_date)
    doc = {"id": new_id(), **inp.model_dump(), "transaction_date": tx_date,
           "party_name": await _party_name(inp.party_id, inp.party_type), "created_at": now_iso()}
    await db.account_transactions.insert_one(doc)
    await audit("ACCOUNT_TRANSACTION", "account_transaction", doc["id"], details={"kind": inp.kind, "amount": inp.amount})
    return clean(doc)


@api.post("/accounts/rates")
async def create_rate_card(inp: RateCardIn):
    await _assert_month_open(inp.effective_from)
    doc = {"id": new_id(), **inp.model_dump(), "created_at": now_iso()}
    await db.rate_cards.insert_one(doc)
    await audit("RATE_CARD", "rate_card", doc["id"], details={"work_type": inp.work_type, "rate": inp.rate})
    return clean(doc)


@api.get("/accounts/rates")
async def list_rate_cards(party_id: Optional[str] = None):
    q = {"party_id": party_id} if party_id else {}
    return [clean(r) for r in await db.rate_cards.find(q).sort("effective_from", -1).to_list(5000)]


_DEFAULT_ACCOUNTS = [
    ("1000", "Cash", "ASSET"), ("1010", "Bank", "ASSET"), ("1020", "UPI", "ASSET"),
    ("1100", "Customer Receivables", "ASSET"), ("1200", "Raw Material Inventory", "ASSET"),
    ("2000", "Supplier Payables", "LIABILITY"), ("2100", "Worker Payables", "LIABILITY"), ("2200", "Fabricator Payables", "LIABILITY"),
    ("4000", "Upper Sales", "REVENUE"), ("5000", "Raw Materials", "DIRECT_COST"), ("5100", "Cutting", "DIRECT_COST"),
    ("5200", "Printing", "DIRECT_COST"), ("5300", "Stitching", "DIRECT_COST"), ("5400", "Packaging", "DIRECT_COST"),
    ("6000", "Factory Overhead", "OVERHEAD"), ("7000", "Administration", "EXPENSE"), ("7100", "Selling & Distribution", "EXPENSE"),
]


async def _ensure_chart():
    for code, name, group in _DEFAULT_ACCOUNTS:
        await db.chart_of_accounts.update_one({"code": code}, {"$setOnInsert": {"id": new_id(), "code": code, "name": name, "group": group, "active": True, "created_at": now_iso()}}, upsert=True)


def _payment_account(mode: Optional[str]) -> str:
    return {"Cash": "1000", "Bank Transfer": "1010", "Cheque": "1010", "UPI": "1020"}.get(mode or "", "1000")


@api.get("/accounts/chart-of-accounts")
async def chart_of_accounts():
    await _ensure_chart()
    return [clean(a) for a in await db.chart_of_accounts.find({}).sort("code", 1).to_list(500)]


@api.get("/suppliers")
async def list_suppliers():
    return await _list("suppliers")


@api.post("/suppliers")
async def create_supplier(inp: SupplierIn):
    return await _create("suppliers", inp.model_dump(), "supplier")


@api.post("/accounts/expenses")
async def create_expense(inp: ExpenseIn):
    expense_date = inp.expense_date or now_iso()
    await _assert_month_open(expense_date)
    doc = {"id": new_id(), **inp.model_dump(), "expense_date": expense_date, "created_at": now_iso()}
    await db.expenses.insert_one(doc)
    # Expense rows are one transaction source for all cash books and costing.
    await db.account_transactions.insert_one({"id": new_id(), "party_id": inp.vendor_id or "FACTORY", "party_type": "EXPENSE", "party_name": "Factory Expense", "kind": "EXPENSE", "amount": inp.amount, "transaction_date": expense_date, "payment_mode": inp.payment_mode, "reference_no": inp.invoice_no, "notes": inp.notes, "expense_id": doc["id"], "classification": inp.classification, "created_at": now_iso()})
    await audit("EXPENSE", "expense", doc["id"], details={"category": inp.category, "amount": inp.amount})
    return clean(doc)


@api.get("/accounts/expenses")
async def list_expenses(month: Optional[str] = None):
    first, last = _period_bounds(month, None, None)
    return [clean(x) for x in await db.expenses.find({}).sort("expense_date", -1).to_list(5000) if _in_period(x.get("expense_date"), first, last)]


@api.post("/accounts/journals")
async def create_journal(inp: JournalIn):
    entry_date = inp.journal_date or now_iso()
    await _assert_month_open(entry_date)
    debit, credit = sum(x.debit for x in inp.lines), sum(x.credit for x in inp.lines)
    if not inp.lines or round(debit, 2) != round(credit, 2) or debit <= 0:
        raise HTTPException(400, "Journal requires balanced non-zero debit and credit totals")
    await _ensure_chart()
    doc = {"id": new_id(), "journal_no": await next_seq("JRN", "JRN"), "journal_date": entry_date, "reference": inp.reference, "description": inp.description, "lines": [x.model_dump() for x in inp.lines], "created_at": now_iso()}
    await db.journal_entries.insert_one(doc); await audit("JOURNAL", "journal", doc["id"], details={"journal_no": doc["journal_no"], "amount": debit})
    return clean(doc)


@api.get("/accounts/journals")
async def list_journals(month: Optional[str] = None):
    first, last = _period_bounds(month, None, None)
    return [clean(x) for x in await db.journal_entries.find({}).sort("journal_date", -1).to_list(5000) if _in_period(x.get("journal_date"), first, last)]


async def _applicable_rate(party_id: str, work_type: str, when: str) -> float:
    d = (_as_date(when) or date.today()).isoformat()
    card = await db.rate_cards.find_one({"party_id": party_id, "work_type": work_type, "effective_from": {"$lte": d}}, sort=[("effective_from", -1)])
    return card.get("rate", 0) if card else 0


async def _account_rows(party_id: str, party_type: str, start: date, end: date):
    """Return immutable derived work/dispatch rows plus posted accounting rows."""
    rows = []
    if party_type == "CUSTOMER":
        async for d in db.dispatches.find({"customer_id": party_id, "status": "DISPATCHED"}):
            if _in_period(d.get("dispatch_date"), start, end):
                rows.append({"date": d["dispatch_date"], "type": "DISPATCH", "reference": d.get("dispatch_no"), "qty": d.get("total_pairs", 0), "rate": 0, "debit": d.get("sales_amount", 0), "credit": 0, "note": "Generated from dispatch"})
    elif party_type == "FABRICATOR":
        async for ret in db.fabricator_returns.find({"fabricator_id": party_id}):
            if _in_period(ret.get("return_date"), start, end):
                good = sum(x.get("good", 0) for x in ret.get("size_results", []))
                rate = await _applicable_rate(party_id, "STITCHING", ret["return_date"])
                rows.append({"date": ret["return_date"], "type": "WORK_COMPLETED", "reference": ret.get("plan_no"), "qty": good, "rate": rate, "debit": 0, "credit": round(good * rate, 2), "note": "Accepted stitching return"})
    async for tx in db.account_transactions.find({"party_id": party_id, "party_type": party_type}):
        if _in_period(tx.get("transaction_date"), start, end):
            # Customer dispatch is a receivable debit; worker work is a payable credit.
            customer = party_type == "CUSTOMER"
            payment = tx.get("kind") in {"PAYMENT", "PAYMENT_RECEIVED", "ADVANCE"}
            debit = tx["amount"] if (customer and not payment) or (not customer and payment) else 0
            credit = tx["amount"] if (customer and payment) or (not customer and not payment) else 0
            rows.append({"date": tx["transaction_date"], "type": tx["kind"], "reference": tx.get("reference_no"), "qty": 0, "rate": 0, "debit": debit, "credit": credit, "note": tx.get("notes")})
    return sorted(rows, key=lambda r: r["date"])


@api.get("/accounts/party-ledger")
async def party_ledger(party_id: str, party_type: str = "CUSTOMER", month: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None):
    first, last = _period_bounds(month, start, end)
    all_rows = await _account_rows(party_id, party_type, date.min, last)
    opening = sum(r["debit"] - r["credit"] for r in all_rows if _as_date(r["date"]) < first)
    balance = opening
    rows = []
    for row in [r for r in all_rows if _in_period(r["date"], first, last)]:
        balance += row["debit"] - row["credit"]
        rows.append({**row, "balance": round(balance, 2)})
    return {"party_id": party_id, "party_name": await _party_name(party_id, party_type), "party_type": party_type,
            "from": first.isoformat(), "to": last.isoformat(), "opening_balance": round(opening, 2), "closing_balance": round(balance, 2), "rows": rows}


@api.get("/accounts/day-book")
async def day_book(month: Optional[str] = None):
    first, last = _period_bounds(month, None, None); rows = []
    async for tx in db.account_transactions.find({}):
        if _in_period(tx.get("transaction_date"), first, last):
            rows.append({"date": tx["transaction_date"], "type": tx.get("kind"), "party": tx.get("party_name"), "reference": tx.get("reference_no"), "amount": tx.get("amount", 0), "mode": tx.get("payment_mode"), "notes": tx.get("notes")})
    async for d in db.dispatches.find({"status": "DISPATCHED"}):
        if _in_period(d.get("dispatch_date"), first, last): rows.append({"date": d["dispatch_date"], "type": "DISPATCH", "party": (await db.customers.find_one({"id": d.get("customer_id")} ) or {}).get("name"), "reference": d.get("dispatch_no"), "amount": d.get("sales_amount", 0), "mode": None, "notes": "Generated dispatch"})
    return sorted(rows, key=lambda x: x["date"], reverse=True)


@api.get("/accounts/books/{book}")
async def financial_book(book: str, month: Optional[str] = None):
    modes = {"cash": {"Cash"}, "bank": {"Bank Transfer", "Cheque"}, "upi": {"UPI"}}
    if book.lower() not in modes: raise HTTPException(400, "Book must be cash, bank or upi")
    first, last = _period_bounds(month, None, None); rows = []; balance = 0.0
    async for tx in db.account_transactions.find({}):
        if tx.get("payment_mode") not in modes[book.lower()] or not _in_period(tx.get("transaction_date"), first, last): continue
        # Receipts increase money; payments, advances and expenses decrease it.
        incoming = tx.get("kind") == "PAYMENT_RECEIVED"
        signed = tx.get("amount", 0) if incoming else -tx.get("amount", 0)
        balance += signed; rows.append({"date": tx["transaction_date"], "type": tx.get("kind"), "party": tx.get("party_name"), "reference": tx.get("reference_no"), "receipt": signed if signed > 0 else 0, "payment": -signed if signed < 0 else 0, "balance": round(balance, 2)})
    return {"book": book.upper(), "from": first.isoformat(), "to": last.isoformat(), "opening_balance": 0, "closing_balance": round(balance, 2), "rows": sorted(rows, key=lambda x: x["date"])}


@api.get("/accounts/outstanding")
async def outstanding(month: Optional[str] = None):
    result = []
    for party_type, collection in [("CUSTOMER", "customers"), ("SUPPLIER", "suppliers"), ("WORKER", "workers"), ("FABRICATOR", "fabricators")]:
        async for party in db[collection].find({"active": {"$ne": False}}):
            ledger = await party_ledger(party["id"], party_type, month)
            balance = ledger["closing_balance"]
            if balance:
                # Receivable balances are debit-positive; payable balances credit-negative.
                result.append({"party_id": party["id"], "party": party.get("name"), "type": party_type, "outstanding": balance if party_type == "CUSTOMER" else abs(balance), "direction": "RECEIVABLE" if party_type == "CUSTOMER" else "PAYABLE"})
    return result


@api.get("/accounts/payment-sheet")
async def payment_sheet(month: Optional[str] = None, party_type: Optional[str] = None):
    rows = await outstanding(month)
    return [r for r in rows if r["direction"] == "PAYABLE" and (not party_type or r["type"] == party_type)]


@api.get("/accounts/dashboard")
async def accounts_dashboard(month: Optional[str] = None):
    first, last = _period_bounds(month, None, None)
    day = datetime.now(timezone.utc).date()
    day_rows = [x for x in await day_book(month) if _as_date(x["date"]) == day]
    entries = [clean(x) for x in await db.account_transactions.find({}).to_list(10000) if _in_period(x.get("transaction_date"), first, last)]
    receipts = sum(x["amount"] for x in entries if x.get("kind") == "PAYMENT_RECEIVED")
    payments = sum(x["amount"] for x in entries if x.get("kind") in {"PAYMENT", "ADVANCE"})
    expenses = sum(x["amount"] for x in entries if x.get("kind") == "EXPENSE")
    out = await outstanding(month); cost = await monthly_cost_analysis(month)
    return {"today": {"receipts": sum(x["amount"] for x in day_rows if x["type"] == "PAYMENT_RECEIVED"), "payments": sum(x["amount"] for x in day_rows if x["type"] in {"PAYMENT", "ADVANCE"}), "expenses": sum(x["amount"] for x in day_rows if x["type"] == "EXPENSE")}, "month": {"receipts": receipts, "payments": payments, "expenses": expenses, "manufacturing_cost": cost["total_cost"], "cost_per_pair": cost["cost_per_pair"]}, "outstanding": out, "payment_due": [x for x in out if x["direction"] == "PAYABLE"]}


@api.get("/reports/monthly-cost-analysis")
async def monthly_cost_analysis(month: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None):
    first, last = _period_bounds(month, start, end)
    materials = {m["id"]: m for m in await _list("materials")}
    material_cost = 0.0
    async for tx in db.material_transactions.find({"kind": "MATERIAL_CONSUMPTION"}):
        if _in_period(tx.get("at"), first, last):
            material_cost += tx.get("qty", 0) * materials.get(tx.get("material_id"), {}).get("current_rate", 0)
    good_pairs = 0
    async for tx in db.finished_stock_transactions.find({"kind": "QC_PASS"}):
        if _in_period(tx.get("at"), first, last): good_pairs += tx.get("qty", 0)
    stitching_cost = 0.0
    async for ret in db.fabricator_returns.find({}):
        if _in_period(ret.get("return_date"), first, last):
            good = sum(x.get("good", 0) for x in ret.get("size_results", []))
            stitching_cost += good * await _applicable_rate(ret.get("fabricator_id", ""), "STITCHING", ret["return_date"])
    expense_rows = [clean(x) for x in await db.account_transactions.find({"party_type": "EXPENSE"}).to_list(5000) if _in_period(x.get("transaction_date"), first, last)]
    overhead = sum(x.get("amount", 0) for x in expense_rows)
    heads = {"Materials": material_cost, "Cutting": 0, "Printing": 0, "Stitching": stitching_cost, "QC/Other": 0, "Packaging": 0, "Fixed Overhead": overhead}
    total = sum(heads.values())
    breakdown = [{"head": k, "total": round(v, 2), "cost_per_pair": round(v / good_pairs, 2) if good_pairs else None, "percent": round(v / total * 100, 1) if total else 0} for k, v in heads.items()]
    return {"from": first.isoformat(), "to": last.isoformat(), "good_pairs": good_pairs, "total_pairs_produced": good_pairs, "total_cost": round(total, 2), "cost_per_pair": round(total / good_pairs, 2) if good_pairs else None, "breakdown": breakdown,
            "data_note": "Cost heads without a historical work rate or transaction are shown as zero; enter rate cards and expense transactions to activate them."}


@api.get("/reports/monthly-party-dispatch")
async def monthly_party_dispatch(month: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None):
    first, last = _period_bounds(month, start, end); customers = {c["id"]: c for c in await _list("customers")}; result = {}
    async for d in db.dispatches.find({"status": "DISPATCHED"}):
        if not _in_period(d.get("dispatch_date"), first, last): continue
        row = result.setdefault(d["customer_id"], {"party_id": d["customer_id"], "party": customers.get(d["customer_id"], {}).get("name", "Unknown"), "dispatches": 0, "pairs_dispatched": 0, "dispatch_value": 0})
        row["dispatches"] += 1; row["pairs_dispatched"] += d.get("total_pairs", 0); row["dispatch_value"] += d.get("sales_amount", 0)
    for row in result.values():
        ledger = await party_ledger(row["party_id"], "CUSTOMER", month, start, end); row["payment_received"] = sum(x["credit"] for x in ledger["rows"]); row["outstanding"] = ledger["closing_balance"]
    return list(result.values())


@api.get("/costing/article-wise")
async def article_wise_costing(month: Optional[str] = None, article_id: Optional[str] = None,
                               colour_id: Optional[str] = None, customer_id: Optional[str] = None):
    """Actual cost by Article + Colour + good output period.

    Material cost is attached to the producing plan and uses its issue-time rate
    snapshot.  Factory expenses are allocated by good pairs, the currently
    configured default allocation method.
    """
    first, last = _period_bounds(month, None, None)
    materials = {m["id"]: m for m in await _list("materials")}
    articles = {a["id"]: a for a in await _list("articles")}
    colours = {c["id"]: c for c in await _list("colours")}
    plans = {p["id"]: clean(p) for p in await db.production_plans.find({}).to_list(5000)}
    outputs = {}
    async for stock in db.finished_stock_transactions.find({"kind": "QC_PASS"}):
        if not _in_period(stock.get("at"), first, last):
            continue
        plan = plans.get(stock.get("plan_id"))
        if not plan or (article_id and plan.get("article_id") != article_id) or (colour_id and plan.get("colour_id") != colour_id):
            continue
        order = await db.customer_orders.find_one({"id": plan.get("customer_order_id")})
        if customer_id and (not order or order.get("customer_id") != customer_id):
            continue
        outputs[plan["id"]] = outputs.get(plan["id"], 0) + stock.get("qty", 0)

    buckets = {}
    for plan_id, good in outputs.items():
        plan = plans[plan_id]; key = (plan.get("article_id"), plan.get("colour_id"))
        b = buckets.setdefault(key, {"article_id": key[0], "colour_id": key[1], "good_pairs": 0, "material": 0.0, "stitching": 0.0, "standard_material": 0.0, "plans": []})
        b["good_pairs"] += good; b["plans"].append(plan.get("plan_no"))
        material_total = 0.0
        async for tx in db.material_transactions.find({"plan_id": plan_id, "kind": "MATERIAL_CONSUMPTION"}):
            material_total += tx.get("qty", 0) * tx.get("unit_rate", materials.get(tx.get("material_id"), {}).get("current_rate", 0))
        # Allocate plan material issued to actual good output, not ordered pairs.
        b["material"] += material_total
        bom = plan.get("bom_snapshot") or await _find_bom(plan["article_id"], plan.get("colour_id"))
        if bom:
            b["standard_material"] += sum(line.get("consumption_per_pair", 0) * materials.get(line.get("material_id"), {}).get("current_rate", 0) for line in bom.get("lines", [])) * good
        async for ret in db.fabricator_returns.find({"plan_id": plan_id}):
            accepted = sum(r.get("good", 0) for r in ret.get("size_results", []))
            rate = await _applicable_rate(ret.get("fabricator_id", ""), "STITCHING", ret.get("return_date", now_iso()))
            b["stitching"] += accepted * rate

    factory_overhead = sum(x.get("amount", 0) for x in await db.account_transactions.find({"party_type": "EXPENSE"}).to_list(5000) if _in_period(x.get("transaction_date"), first, last))
    total_good = sum(b["good_pairs"] for b in buckets.values())
    rows = []
    for b in buckets.values():
        good = b["good_pairs"]; overhead = factory_overhead * good / total_good if total_good else 0
        total = b["material"] + b["stitching"] + overhead
        rows.append({"article_id": b["article_id"], "article": articles.get(b["article_id"], {}).get("code", "-"), "colour_id": b["colour_id"], "colour": colours.get(b["colour_id"], {}).get("name", "-"), "good_pairs": good,
                     "material": round(b["material"] / good, 2) if good else 0, "cutting": 0, "printing": 0, "stitching": round(b["stitching"] / good, 2) if good else 0, "packaging": 0,
                     "factory_overhead": round(overhead / good, 2) if good else 0, "actual_cost_per_pair": round(total / good, 2) if good else 0,
                     "standard_material_per_pair": round(b["standard_material"] / good, 2) if good else 0, "variance_per_pair": round((total - b["standard_material"]) / good, 2) if good else 0, "plans": b["plans"]})
    return {"from": first.isoformat(), "to": last.isoformat(), "allocation_method": "GOOD_PAIRS", "unallocated_factory_overhead": round(factory_overhead if not total_good else 0, 2), "rows": sorted(rows, key=lambda x: (x["article"], x["colour"])),
            "data_note": "Cutting, printing and packaging remain zero until their completion/rate transactions are configured. Historical material issue rates are preserved for new issues."}


@api.post("/accounts/close-month")
async def close_month(inp: MonthCloseIn):
    first, last = _period_bounds(inp.month, None, None)
    if await db.month_closings.find_one({"month": inp.month}): raise HTTPException(400, "Month is already closed")
    report = await monthly_cost_analysis(inp.month)
    doc = {"id": new_id(), "month": inp.month, "closed_at": now_iso(), "snapshot": report}
    await db.month_closings.insert_one(doc); await audit("CLOSE_MONTH", "month", inp.month, details={"cost_per_pair": report["cost_per_pair"]})
    return clean(doc)


@api.get("/costing/control-center")
async def costing_control_center():
    """Live standard-vs-actual material costing from BOM, rates and RM issues."""
    materials = {m["id"]: m for m in await _list("materials")}
    plans = [clean(p) for p in await db.production_plans.find({}).to_list(5000)]
    article_rows = {}
    plan_rows = []
    for plan in plans:
        if not plan.get("qty"):
            continue
        bom = plan.get("bom_snapshot") or await _find_bom(plan["article_id"], plan.get("colour_id"))
        if not bom:
            continue
        standard_total = sum(line.get("consumption_per_pair", 0) * materials.get(line.get("material_id"), {}).get("current_rate", 0) for line in bom.get("lines", []))
        actual_total = 0.0
        issued = False
        async for tx in db.material_transactions.find({"plan_id": plan["id"], "kind": "MATERIAL_CONSUMPTION"}):
            issued = True
            actual_total += tx.get("qty", 0) * materials.get(tx.get("material_id"), {}).get("current_rate", 0)
        actual_per_pair = round(actual_total / plan["qty"], 2) if issued else None
        standard_per_pair = round(standard_total, 2)
        row = {"plan_id": plan["id"], "plan_no": plan["plan_no"], "article_id": plan["article_id"], "colour_id": plan.get("colour_id"), "qty": plan["qty"], "standard_material_cost": standard_per_pair, "actual_material_cost": actual_per_pair, "variance": round(actual_per_pair - standard_per_pair, 2) if actual_per_pair is not None else None}
        plan_rows.append(row)
        key = (plan["article_id"], plan.get("colour_id"))
        bucket = article_rows.setdefault(key, {"article_id": key[0], "colour_id": key[1], "plans": 0, "standard_total": 0.0, "actual_total": 0.0, "actual_count": 0})
        bucket["plans"] += 1; bucket["standard_total"] += standard_per_pair
        if actual_per_pair is not None:
            bucket["actual_total"] += actual_per_pair; bucket["actual_count"] += 1
    articles = {a["id"]: a for a in await _list("articles")}; colours = {c["id"]: c for c in await _list("colours")}
    article_costs = [{"article": articles.get(v["article_id"], {}).get("code", "-"), "colour": colours.get(v["colour_id"], {}).get("name", "-"), "plans": v["plans"], "standard": round(v["standard_total"] / v["plans"], 2), "actual": round(v["actual_total"] / v["actual_count"], 2) if v["actual_count"] else None} for v in article_rows.values()]
    for row in article_costs: row["variance"] = round(row["actual"] - row["standard"], 2) if row["actual"] is not None else None
    return {"article_costs": article_costs, "plan_costs": plan_rows, "rated_materials": sum(1 for m in materials.values() if m.get("current_rate", 0) > 0)}


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
                  "document_sequences", "account_transactions", "rate_cards", "month_closings", "suppliers",
                  "expenses", "journal_entries", "chart_of_accounts"]:
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
        "pairs_per_bag": 20,
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


@app.on_event("startup")
async def initialize_packing_metadata():
    # Only the user's confirmed Article 04 / Men 6–10 rule is initialized.
    article = await db.articles.find_one({"code": "04"})
    if article:
        await db.plan_configurations.update_many(
            {"article_id": article["id"], "name": "Men 6-10", "pairs_per_bag": {"$exists": False}},
            {"$set": {"pairs_per_bag": 20}})
    async for p in db.production_plans.find({"status": "QC", "pending_qc": None}):
        ret = await db.fabricator_returns.find_one({"plan_id": p["id"]}, sort=[("return_date", -1)])
        if ret:
            await ensure_qc_ticket(p, ret["id"])
    async for d in db.dispatches.find({"packing_groups": {"$exists": False}}):
        summary = await dispatch_packing(clean(d))
        await db.dispatches.update_one({"id": d["id"]}, {"$set": summary})


app.include_router(api)


@app.on_event("startup")
async def install_confirmed_factory_masters():
    # Elite 01 was explicitly approved as a standard factory configuration.
    # Upsert is idempotent, so deployment never duplicates it.
    try:
        await setup_elite_01()
    except Exception:
        log.exception("Could not install Elite 01 component configuration at startup")

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
