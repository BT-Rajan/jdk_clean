# Inventory, BOM & MRP Integration Audit

**Status:** Audit only — no code changed. This documents exactly how stock,
BOM, and MRP work today so a future Production Order layer reuses them
instead of building a second inventory/requirements system.

## 1. How Stock Is Represented

Both a running balance **and** a full ledger, kept in sync by a single write
path — not two competing mechanisms.

- **Balance tables** (one row per item, upserted, no history):
  - `FinishedGoodsInventory` (`finished_goods_inventory`) —
    `backend/app/models/inventory.py:11-22` — `product_id` (unique FK),
    `quantity_on_hand`, `quantity_reserved`.
  - `RawMaterialInventory` (`raw_material_inventory`) — same file, :25-36 —
    identical shape, keyed on `raw_material_id`.
  - Rows are lazily created on first touch
    (`_get_or_create_inventory_row`, `inventory_service.py:16-34`).

- **Ledger table**: `StockMovement` (`stock_movements`) —
  `backend/app/models/inventory.py:39-72` — `item_type`
  (`raw_material`/`product`), `item_id`, `movement_type` (`receipt`, `issue`,
  `adjustment`, `production_in`, `production_out`, `return`,
  `return_to_supplier`), signed `quantity`, `reference_type`/`reference_id`
  (polymorphic pointer back to whatever caused the movement — a purchase
  order, a production schedule, a supplier return, etc.), plus
  `supplier_id`, `unit_cost`, `batch_number`, `expiry_date`,
  `invoice_number`, `received_by`, `received_date`, `notes`.
  - Note: the model defines `production_in`/`production_out` movement types,
    but the actual production code posts consumption/output using the
    generic `issue`/`receipt` types instead (`production_service.py:528-552`)
    — the two production-specific enum values appear unused today. Not a
    defect; just worth knowing before assuming those types carry data.

- **Single write path**: `inventory_service.adjust_stock()`
  (`inventory_service.py:57-152`) updates the balance row **and** inserts a
  `StockMovement` row in the same transaction, and refuses to let on-hand go
  negative. This is the only function that mutates `quantity_on_hand`
  anywhere in the codebase.

- **Same mechanism for raw materials and finished goods** — both route
  through one `_INVENTORY_MODEL` dispatch dict
  (`inventory_service.py:10-13`). Products with `product_type ==
  "sub_assembly"` use the exact same `FinishedGoodsInventory` table as
  ordinary finished goods; there is no separate inventory layer for
  sub-assemblies.

- **Packaging is not a separate inventory item type.** Packaging materials
  are literally `raw_materials` rows (`material_type = 'packaging'`);
  `product_packaging_lines` only defines *what* packaging a product needs,
  and — confirmed by that model's own docstring
  (`product_packaging.py:20-23`) — **nothing in the codebase deducts
  packaging stock automatically**. This is the one clear inventory-adjacent
  gap (also listed in `production-audit.md`).

## 2. Movement Sources Already Wired

| Event | Function | Movement type |
|---|---|---|
| Purchase order receipt | `purchase_order_service.receive_lines` (:342-441) | `receipt` (raw material) |
| Supplier return | `supplier_return_service.create_supplier_return` (:86-142) | `return_to_supplier` (raw material) |
| Production material consumption | `production_service._record_output` (:512-539) | `issue` (raw material) |
| Production output | `production_service._record_output` (:541-552) | `receipt` (product) — fires on **every** partial log, not only final completion |
| Order shipment | `order_service.change_status`, "shipped" branch (:402-430) | `issue` (product) |
| Order cancelled after shipment | `order_service.change_status` (:480-491) | `return` (product) |

Every one of these already exists and is exercised — a Production Order
layer needs zero new movement types for the core loop.

## 3. Reservation/Allocation — What's Real Today

- Columns: `quantity_reserved` on both inventory tables.
- Functions: `reserve_stock()` / `release_reservation()`
  (`inventory_service.py:155-194`). Reservations are **allowed to exceed
  on-hand** by design — a shortfall here is a future MRP signal, not
  something to block.
- Consumers:
  - **Orders** reserve finished goods on confirm, release proportionally on
    shipment, release in full on cancellation (`order_service.change_status`,
    :399-502).
  - **Production** reserves raw materials via BOM explosion the moment a
    batch is created (`production_service._reserve_batch_materials`,
    :138-163), releases on edit/delete/completion/cancellation, scoped to
    "planned minus already-produced" (:166-207).
- **This is an aggregate counter, not a per-order/per-batch ledger** —
  confirmed explicitly in the code's own comments
  (`production_readiness_service.py:298-299`: "no per-batch ledger of
  reservations, only the aggregate `quantity_reserved` column"). The system
  can say "12 units of material X are reserved" but not "reserved for
  which specific batch" without cross-referencing every active batch's BOM
  explosion by hand. This is fine for today's scale and hasn't caused a
  known problem; flagged in `production-lifecycle.md` as something to
  revisit only if fine-grained per-batch reservation auditing becomes an
  actual requirement.
- No separate reservation/allocation table exists anywhere (confirmed by a
  full case-insensitive grep for "reserv"/"alloc" across `backend/app`).

## 4. BOM — Storage and Normalization

- Tables: `boms` (header, `backend/app/models/bom.py:29-49`) and `bom_lines`
  (:54-79).
- **One BOM per product** — `Bom.product_id` is unique. No versioning/ECO
  history; explicitly a design choice (`bom.py:21-25` docstring).
- **Quantities are per-batch, not strictly per-unit** — `Bom.output_quantity`
  (default 1) is the batch size the line quantities are expressed against.
  If `output_quantity == 1`, per-batch and per-unit are the same number;
  otherwise they are not. Any future Production code must scale by
  `output_quantity`, not assume 1.
- **Packaging is deliberately excluded from BOM lines** — it is a fully
  separate table (`product_packaging_lines`); `bom_service.explode_requirements`
  never touches it (see §1 above and `bom.py:12-28`).
- Raw-material requirement calculation: `explode_requirements` (:333-389,
  recursive, multi-level via `BomLine.component_type` = `raw_material` or
  `product`, scrap-inflated, active-BOM-only, cycle-checked with
  `MAX_BOM_DEPTH=10`). `explode_requirements_detailed` (:392-437) returns
  both the raw (`net_required`) and scrap-inflated figures — this is what
  production uses to compare actual vs. planned material consumption.
- **BOM changes after a batch exists are not snapshotted.** If a BOM is
  edited while a `ProductionSchedule` referencing that product is still
  open, the batch's material requirements (computed live via
  `explode_requirements_detailed` whenever readiness/execution runs) will
  reflect the **new** BOM, not the one in effect when the batch was created.
  This has not caused an issue because BOM edits are admin-gated and
  infrequent, but it is a real behavior to be aware of before Production
  Orders start referencing "the BOM used" as a fact of record — if that
  matters for traceability/audit, a BOM version/snapshot reference on the
  future `ProductionOrder` (see `production-lifecycle.md` §2) would be the
  minimal fix, not a rewrite of BOM itself.

## 5. MRP — What It Actually Calculates

A real, dedicated, wired module — not just logic embedded in feasibility.

- `backend/app/api/mrp.py` — `GET /api/mrp`, one endpoint.
- `backend/app/services/mrp_service.py`:
  - `_quantity_to_produce` (:23-77) — demand = every non-completed
    `ProductionSchedule` (`planned`/`in_progress`/`paused`) remaining
    quantity, **plus** outstanding confirmed order lines that don't yet have
    a batch scheduled, net of current finished-goods stock. Explicitly
    designed to avoid double-counting a line that already has a batch.
  - `_raw_material_requirements` (:80-93) — explodes each product's
    to-produce quantity via `bom_service.explode_requirements`.
  - `suggest_purchases` (:96-146) — greedy supplier allocation ordered by
    `SupplierMaterial.lead_time_days` ascending, capped by each supplier's
    `max_supply_quantity`. Public specifically so `feasibility_service`
    reuses the identical algorithm rather than re-implementing it
    (confirmed call site: `feasibility_service.py:454`).
  - `compute_requirements` (:149-193) — the full pass: demand → BOM
    explosion → net against on-hand → shortfall → suggested purchases.
    Explicitly documented as computed fresh every call, nothing persisted.
- **Supplier lead time is already considered** —
  `SupplierMaterial.lead_time_days` drives both supplier ranking in
  `suggest_purchases` and the "expected available date" projection used by
  feasibility (`feasibility_service.py:460-471`).
- **Existing feasibility logic is directly reusable, and already reused** —
  feasibility's shortfall/capacity machinery
  (`capacity_service.py`, `bom_service.explode_requirements`,
  `raw_material_alternative_service`, `mrp_service.suggest_purchases`) is
  shared across feasibility, order auto-scheduling, and production
  readiness today. A Production Order layer should call the same shared
  services, exactly as `production_readiness_service.py` already does —
  not reimplement any part of this chain.

## 6. Minimum Changes Identified for Future Production Work

Nothing here is being implemented in this pass — this is the "what would
actually need to change later" list, kept as small as the evidence supports:

1. **Order-line traceability** — add an `order_detail_id` reference on
   whatever WHAT-to-produce record is introduced (see
   `production-lifecycle.md` §2), so a batch can be traced to a specific
   order line, not just the whole order.
2. **Packaging deduction** — wire a call to `inventory_service.adjust_stock`
   for packaging materials at production completion and/or delivery. The
   data model already supports this; only the call site is missing.
3. **BOM reference on production record** — if audit/traceability of "which
   BOM was used" becomes a requirement, store a reference (or a lightweight
   snapshot) on the production record at creation time, since BOM itself
   isn't versioned.
4. **Optional: per-batch reservation ledger** — only if fine-grained
   "reserved by which batch" auditing becomes an actual requirement; today's
   aggregate `quantity_reserved` has not caused a known problem.

None of these require rewriting BOM, MRP, or the inventory ledger — all four
are additive to what already exists.
