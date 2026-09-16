# Production Lifecycle — Target Architecture

**Status:** Architecture proposal only. Nothing in this document has been
implemented in this pass. See `docs/production-audit.md` for what already
exists; this document is about how a future **Production Order** layer should
sit on top of it.

## 1. Target Lifecycle vs. What Exists Today

```
Confirmed Customer Order
    ↓
Production Order            <-- does not exist as a distinct entity today
    ↓
BOM / Material Requirement       <-- EXISTS: bom_service.explode_requirements
    ↓
Material Availability / Allocation   <-- EXISTS: inventory_service + quantity_reserved
    ↓
Production Planning & Scheduling <-- EXISTS: ProductionSchedule + capacity_service
    ↓
Production Execution             <-- EXISTS: production_service.log_partial_production / _record_output
    ↓
QC / Production Completion       <-- PARTIAL: material-discrepancy check only, no finished-unit QC
    ↓
Finished Goods Stock             <-- EXISTS: FinishedGoodsInventory, updated on every output log
    ↓
Delivery                         <-- EXISTS: delivery_note_service
```

Read plainly: **eight of the nine stages already work**. The one missing
piece is a distinct "Production Order" record between the confirmed customer
order and the existing `ProductionSchedule`. Today, `ProductionSchedule`
itself absorbs the WHAT (product + quantity), most of the WHEN/WHERE (machine
+ dates), and part of the WHAT-happened (`produced_quantity`, `actual_start`/
`actual_end`, discrepancy notes) — three concepts the brief explicitly warns
against merging, already merged, and already working in production. This is
the central architectural question for P2, not something to fix reflexively
in this pass (see §5, Hardening Rules).

## 2. Production Order / Production Schedule / Production Execution — the Distinction

| Concept | Defines | Today |
|---|---|---|
| **Production Order** | WHAT needs to be produced, for which customer order/line, by when | Does not exist as its own table. The closest thing is `ProductionSchedule.product_id` + `.order_id` + `.planned_quantity` + `.scheduled_end`, but `.order_id` points at the **whole Order**, not an `OrderDetail` line. |
| **Production Schedule** | WHEN / WHERE / with WHAT machine it will run | `ProductionSchedule.machine_id`, `.scheduled_start`, `.scheduled_end` — this part is exactly what the brief describes, and works well. |
| **Production Execution** | WHAT actually happened | `ProductionSchedule.produced_quantity`, `.actual_start`/`.actual_end`, `.material_discrepancy_flag`/`.notes` — also folded into the same row. |

**Why this hasn't caused problems yet:** in the current system, one batch
almost always corresponds to one order line in practice (auto-scheduling
loops per order line and creates one batch per schedulable line — see
`order_service._maybe_auto_schedule_production`). The ambiguity only
surfaces when an order has two lines for the *same* product, or when a
customer order needs to be split across more than one batch with distinct
due dates for the *same* line — cases the current schema cannot cleanly
represent because nothing references the specific `OrderDetail` row.

**Recommended direction for P2** (not implemented here): introduce a
`ProductionOrder` table sitting between `Order`/`OrderDetail` and
`ProductionSchedule`:

```text
Order
  |
  +-- OrderDetail (order line: product_id, quantity)
          |
          +-- ProductionOrder   [NEW — the WHAT]
                  product_id, order_detail_id (FK), planned_quantity,
                  due_date, bom_id (snapshot reference), status
                  |
                  +-- ProductionSchedule (1..N)   [EXISTING — WHEN/WHERE]
                          machine_id, scheduled_start/end
                          |
                          +-- execution fields   [EXISTING — WHAT happened]
                          produced_quantity, actual_start/end, discrepancy notes
```

This preserves every existing, working piece of `ProductionSchedule`
unchanged — it becomes the child of a new, thin `ProductionOrder` header
rather than being torn apart. `ProductionOrder` would carry the
`order_detail_id` FK that's missing today, closing the line-level gap. This
is a proposal for P2 scoping, not a mandate — see §6 for the "do we even
need a new table" analysis.

## 3. Handling Rules (documented, not implemented)

| Scenario | Proposed handling | Current behavior (at the `ProductionSchedule` level) |
|---|---|---|
| One customer order → one production order | Default case; one `ProductionOrder` per order line that needs manufacturing | Already happens implicitly — one batch per schedulable line |
| One customer order → multiple production orders | Normal for a multi-line order | Already happens — the auto-schedule loop creates one batch per line independently |
| Partial production | A `ProductionOrder` accumulates completed quantity across ≥1 child schedules/batches until it reaches the ordered quantity | Already supported at the batch level via `produced_quantity` (cumulative, never reset) and `log_partial_production` |
| Production quantity > ordered quantity | Allowed — overproduction to stock is legitimate (make-to-stock uses `order_id = NULL` already); do not hard-block this | Not constrained today — `planned_quantity` is never validated against the order line's quantity. Recommend keeping it unconstrained; a soft warning could be added later if needed. |
| Cancelled customer order | Cascade-cancel any open production; do not silently orphan work | Already implemented — `order_service._cancel_active_production_batches` cancels planned/in_progress/paused batches tied to the order |
| Cancelled production order/schedule (order still active) | The demand should resurface so nothing is silently dropped | Already self-healing today: a cancelled batch drops out of `mrp_service._quantity_to_produce`'s "open schedule" bucket, but the order (if still confirmed/in_production) still counts as an "outstanding order line with no batch scheduled" — so the next MRP compute surfaces the shortfall again. No explicit re-scheduling trigger exists; this relies on someone re-running/viewing MRP. Worth deciding in P2 whether re-scheduling should be automatic. |
| Already-produced quantity | A future `ProductionOrder` must aggregate `produced_quantity` across all of its child schedules to know total progress | Not needed today since batch and "order fulfilment unit" are effectively 1:1; becomes necessary the moment `ProductionOrder` allows multiple child schedules |

## 4. Proposed Production Status Model

The brief's suggested starting point:

```
PLANNED → MATERIAL_PENDING → READY → SCHEDULED → IN_PROGRESS → COMPLETED
                                                              (+ CANCELLED, ON_HOLD)
```

**Recommendation: do not introduce this as a stored status.** The existing
system already has a clean, working, tested status model on
`ProductionSchedule`:

```
planned → in_progress → paused → completed
   ↓           ↓           ↓
cancelled   cancelled   cancelled
```

(`ALLOWED_TRANSITIONS`, `backend/app/models/production_schedule.py:26-32`)

The brief's `MATERIAL_PENDING`/`READY`/`SCHEDULED` states are **not separate
lifecycle stages that need persisting** — they already exist as a
**computed, on-demand verdict**, not a stored status:
`production_readiness_service.check_readiness` returns one of `READY`,
`MATERIAL_SHORTAGE`, `MACHINE_CONFLICT`, `WORKER_SHORTAGE`,
`MULTIPLE_ISSUES`, `NO_ACTIVE_BOM` every time it's asked (used by the
planned→in_progress start gate and the UI's readiness panel/list indicator).
Storing this as a persisted status would create a second source of truth that
can drift from the live readiness check the moment inventory or the BOM
changes — exactly the kind of duplicate-source-of-truth the brief's own data
ownership rule (§9 below) warns against.

**If a `ProductionOrder` header is introduced (§2)**, its own status should
be a small header-level state — e.g. `open → in_progress → completed` /
`cancelled` — that summarizes its child schedules' states, not a
re-implementation of `ProductionSchedule`'s own richer status. Exact
transitions are a P2 design decision, not decided here.

## 5. Data Ownership

| Data | Owner (existing) |
|---|---|
| Customer | `Customer` model — Client Master |
| Customer Order | `Order`/`OrderDetail` — Orders |
| Product | `Product` — Product Master |
| BOM | `Bom`/`BomLine` — BOM |
| Raw Material | `RawMaterial` — Raw Material Master |
| Supplier | `Supplier`/`SupplierMaterial` — Supplier Master |
| Raw Material Stock | `RawMaterialInventory` + `StockMovement` — Inventory |
| Finished Goods Stock | `FinishedGoodsInventory` + `StockMovement` — Inventory (same mechanism, not a separate one) |
| Machine | `Machine` — Machine Master (single-record today, see audit) |
| Production Schedule (WHEN/WHERE + execution) | `ProductionSchedule` — Production |
| Production Order (WHAT), if introduced | Would be new — Production |
| MRP shortage report | Computed on demand from the above; not persisted anywhere |

No duplicate masters were found. A future `ProductionOrder` table would not
duplicate anything — it would be a thin new owner for exactly one thing
(order-line-to-production traceability) that no existing table owns.

## 6. Database Assessment

| Future need | Verdict | Reasoning |
|---|---|---|
| WHAT-to-produce record (Production Order) | **New table eventually required** — but only if/when order-line-level granularity is actually needed (multiple batches per line, or two lines of the same product on one order). Until then, `ProductionSchedule.order_id` + `.product_id` is a workable proxy. | The gap is real (see §2) but narrow; do not add a table speculatively (per Hardening Rules) — add it when a concrete case (e.g. split due dates for one line) actually requires it. |
| Scheduling | Existing table (`production_schedules`) — reuse unchanged | Already correct shape |
| Execution/actuals | Existing table (`production_schedules`) — reuse unchanged | Already correct shape |
| Material requirement/shortage | No table needed — reuse `bom_service`/`mrp_service` (computed) | Already reusable, read-only by design |
| Reservation | Existing columns (`quantity_reserved`) — reuse; **extension** (not a new table) would be needed only if per-batch reservation traceability becomes a real requirement | Extending existing columns/adding a link table is smaller than a whole new reservation subsystem |
| Packaging consumption | Existing table (`product_packaging_lines`) needs **extension** — specifically, a call site (production completion or delivery) needs to actually call `inventory_service.adjust_stock` for packaging materials; no new table required | The definition already exists; only the missing call needs to be added, later |
| QC/rejection on finished output | Existing table (`production_schedules`) likely needs **extension** (e.g. `rejected_quantity`, `qc_status`) rather than a new table, to keep it next to `produced_quantity` | A separate QC table would only be justified if QC becomes a multi-step workflow with its own approvals; not yet known to be required |

**No production database migration is introduced in this pass.** Everything
in this section is a recommendation for P2 scoping, contingent on actual
requirements once Production Order work is greenlit.

## 7. Integration Boundary — How a Future Production Order Should Consume Existing Systems

- **From Sales:** read `Order`/`OrderDetail` (confirmed status, product,
  quantity, `requested_delivery_date`/`confirmed_delivery_date`) via the
  existing `Order` model — do not duplicate order data onto a new table
  beyond the FK needed for traceability.
- **From BOM/MRP:** call `bom_service.explode_requirements_detailed` for
  material requirements and `mrp_service.compute_requirements`/
  `suggest_purchases` for shortages and lead-time-aware projected-available
  dates — do not recompute shortages independently.
- **From Inventory:** call `inventory_service.get_stock`/
  `get_finished_goods_stock` for availability and
  `reserve_stock`/`release_reservation`/`adjust_stock` for holds and
  movements — do not introduce a second stock ledger.
- **From Purchase:** read `PurchaseOrder`/`PurchaseOrderLine` (via
  `mrp_service.suggest_purchases`, which already reads `SupplierMaterial.
  lead_time_days`) for expected incoming material and lead time — do not
  re-derive supplier lead time separately.
- **From Machine Master:** read `Machine` + `capacity_service` for available
  capacity — respect the existing single-machine constraint unless a
  deliberate decision is made (with the user) to lift it first.

Production should orchestrate these, exactly as `production_readiness_service.py`
already does today (its own docstring states this design intent explicitly) —
a new Production Order layer is one more consumer of the same pattern, not a
reason to change it.

## 8. Risks / Open Questions Flagged for P2 (not resolved here)

1. Whether order-line-level granularity (the `OrderDetail` → `ProductionOrder`
   FK) is actually needed now, or can wait until a concrete case demands it.
2. Whether the single-machine business constraint should ever be lifted —
   this is a product/business decision, not a technical one, and changes a
   deliberately-enforced rule (`crud/master_data.py:258-263`).
3. Whether finished-unit QC/rejection tracking is in scope for Production at
   all, or belongs to a separate future QC module.
4. Whether packaging stock deduction should be wired at production
   completion, at delivery, or both — currently wired at neither.
5. Whether BOM should gain versioning before Production Orders start
   referencing specific BOM snapshots (see `production-inventory-integration.md`).
