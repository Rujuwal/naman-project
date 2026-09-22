# NAMAN UPPER — Upper Manufacturing Control System

## Problem Statement (original)
Build a real, production-ready factory OS for shoe-upper manufacturing covering the complete lifecycle: Customer Order → Production Plan → Cutting → Printing → Stitching Out → Stitching Return → QC → Finished Stock → Dispatch, with atomic BOM/RM logic, dynamic bag packing, size-wise QC, dispatch bag carry-forward, cancellation reversal, and audit trail.

## User Choices
- Auth: **None** (single-user local mode)
- Delivery: **Phase 1** — end-to-end core workflow
- Seed: **Realistic seed data** (Yashvi/Ronak, Article 02/04, Kids 2-5 + Men 6-10)
- Print docs: **A5 HTML printable** in new tab
- Design: Default industrial (dark navy sidebar + light content)

## Architecture
- **Backend**: FastAPI (server.py, one file) + Motor async MongoDB, UUID primary keys, `/api` router prefix
- **Frontend**: React 19 + shadcn/ui + Tailwind, react-router, sonner toasts
- **Fonts**: Outfit (headings), Inter (body), JetBrains Mono (codes)

### Collections
customers, articles, colours, uoms, materials, fabricators, workers, plan_configurations, component_configurations, boms, customer_orders, production_plans, fabricator_jobs, fabricator_returns, qc_records, finished_stock_transactions, dispatches, material_transactions, audit_logs, document_sequences

## Implemented (2026-02)
- Masters CRUD (customers, articles, colours, materials, fabricators, workers, plan configs, component configs, BOMs)
- Plan Configuration with unlimited dynamic sizes → drives CO qty, size breakup, and all downstream flows
- Customer Order entered in **number of plans**; each plan is an independent production unit
- Production Plans with server-side state machine: PLANNED → CUTTING → PRINTING → STITCHING_OUT → QC → REWORK/FINISHED → DISPATCHED
- Start Cutting = atomic BOM consumption; rejects if any material short (no partial deduction)
- Issue to Printing / Issue to Fabricator single-click transitions (no separate "complete X" screens)
- Stitching Return with **dynamic bags** (any count, size-wise) + size-wise good/rework/reject
- QC size-wise (Pass/Rework/Hold) with strict validation and per-plan running qc_passed accumulation
- Finished stock as ledger transactions; positive-only aggregation, per (plan, size)
- Dispatch selects source bags (auto-carries packing list) or plan; atomic deduction; marks bags dispatched
- Dispatch cancel = full reversal (stock restore, bag re-open, dispatched_qty rollback), history preserved with CANCELLED watermark on slip
- Server-side sequential document numbering (CO/PLAN/CUT/PRN/ST/RET/QC/DSP-YYYY-NNNN)
- Audit trail on all major mutations
- Printable A5/A4 slips: Cutting, Printing, Stitching Job Card, QC, Dispatch (with per-spec content rules — no customer/rates/Issued-By on internal slips)
- Dashboard with KPIs, active production, fabricator watch, material requirement (real shortages), recent activity
- Stock Room: RM Stock (current/committed/free), Material Requirement, RM Ledger, Finished Stock

## Verified Acceptance Scenarios
1. **Primary**: Yashvi CO of 1 plan (Article 04, Men 6-10, Black/Brown, 480 pairs) → full pipeline including rework loop → dispatch → cancel with full stock/bag reversal.
2. **Custom Plan Config**: Article X with Kids Custom sizes 1-4 (350 pairs) → CO of 2 plans creates two 350-pair plans, only sizes 1-4 visible.
3. **Material Shortage**: BOM required qty > available → response `{ok:false, shortages:[...]}`, no deduction, plan stays PLANNED.
4. **Dynamic Bags**: 2 bags of any composition summing to plan size → totals auto-calculated → dispatch selects subset.

## Backlog / Next Phase (P1/P2)
- Fabricator performance analytics + accounts ledger (with permissions gating)
- BOM editor UI (backend supports; UI stub in Masters)
- Component/Bundling configuration UI editor
- Advanced reports: article/customer/date-range production, defect analysis, purchase requirement export
- Notifications (overdue fabricator, material shortage, delivery approaching)
- Settings (company, document numbering formats, print branding)
- Users & Roles + permissions (currently no auth)
- CSV/PDF exports for reports and slips
- Second acceptance scenario Article X UI wiring (currently only backend-verified)
- Search results page (global search wired to production filter)

## Environment
- Backend: 0.0.0.0:8001 via supervisor
- Frontend: 3000 via supervisor (hot reload)
- MongoDB: `MONGO_URL` from backend/.env
- Frontend API: `REACT_APP_BACKEND_URL/api`
- Seed endpoint: `POST /api/seed` (idempotent) or `POST /api/seed?force=true` (wipe + reseed)
