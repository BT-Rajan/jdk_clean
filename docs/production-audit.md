# Production Audit — Existing vs. Required

**Status:** P1 audit/foundation pass. No production features were built in this
pass. This document records what already exists in the codebase, verified by
reading source (not inferred from menus or naming).

**Headline finding:** the repository already contains a substantial, wired-in,
tested Production module — not just adjacent pieces. Backend: `ProductionSchedule`
model, `production_service.py`, `production_readiness_service.py`,
`capacity_service.py`, `api/production_schedules.py` (mounted at
`/api/production-schedules`). Frontend: a full `/production` route family
(list/form/detail pages, a readiness panel, a quick-log modal). MRP, BOM,
Machines, Raw Materials, Purchase Orders, and Inventory (including finished
goods) are all similarly complete and actively used by this Production module,
not sitting unused beside it.

This means most of the "capabilities" below are not gaps to fill in a future
pass — they are working systems a future Production Order layer should call
into, not rebuild.

---

## 1. Capability Audit Table

| Capability | Existing? | Location | Working? | Reusable? | Gap |
|---|---|---|---|---|---|
| Customer Order integration | Yes | `backend/app/models/order.py` (`Order`, `OrderDetail`); `backend/app/services/order_service.py` (`_maybe_auto_schedule_production` :794-935, `create_order_from_quotation` :1144-1213, `split_order` :583-735, `_cancel_active_production_batches` :738-791); frontend `pages/orders/*`, `api/orders.ts` | Yes — mounted, actively exercised (order confirm already auto-schedules production) | Yes, as-is | No `OrderDetail`→`ProductionSchedule` line-level FK — a batch links to the whole `Order`, not a specific line (see `production-lifecycle.md` §2) |
| BOM | Yes | `backend/app/models/bom.py` (`Bom`, `BomLine`); `backend/app/services/bom_service.py` (`explode_requirements` :333-389, `explode_requirements_detailed` :392-437, `has_bom` :305-325); `backend/app/api/bom.py`; frontend `products/BomEditor.tsx` (tab on `ProductDetailPage`), `api/bom.ts`, `types/bom.ts` | Yes — used by feasibility, production, MRP | Yes, directly, no changes needed | One active BOM per product (`Bom.product_id` unique) — no versioning/history; a BOM edit after a batch is created is not snapshotted (see §BOM/MRP audit in `production-inventory-integration.md`) |
| Raw material requirement | Yes | `bom_service.explode_requirements` / `explode_requirements_detailed` (recursive, multi-level, scrap-inflated) | Yes | Yes | None identified |
| Packaging requirement | Yes (definition only) | `backend/app/models/product_packaging.py` (`product_packaging_lines`); `backend/app/services/packaging_service.py`; `backend/app/api/packaging.py`; frontend `products/PackagingEditor.tsx` | Yes for CRUD/definition; **not wired to any stock deduction anywhere** (explicit in the model's own docstring, product_packaging.py:20-23) | Definition table is reusable; consumption logic does not exist yet | Real gap — packaging stock is never auto-deducted, not at production completion, not at delivery |
| Inventory availability | Yes | `backend/app/models/inventory.py` (`FinishedGoodsInventory`, `RawMaterialInventory`, `StockMovement`); `backend/app/services/inventory_service.py` (`get_stock`, `get_finished_goods_stock` :205-254, `adjust_stock` :57-152) | Yes — single write path, all movements ledgered | Yes, directly — this is what Production should keep using | None for on-hand/available; see reservation gap below |
| Material reservation/allocation | Partial | `quantity_reserved` column on both inventory tables (inventory.py:19,33); `reserve_stock`/`release_reservation` (inventory_service.py:155-194); consumed by `order_service` (finished goods) and `production_service._reserve_batch_materials` (raw materials, :138-163) | Yes, for aggregate holds | Yes, for aggregate holds | No per-order/per-batch reservation ledger — only an aggregate counter exists; the system cannot answer "which specific batch is this reserved unit held for" from data alone |
| MRP | Yes | `backend/app/api/mrp.py`; `backend/app/services/mrp_service.py` (`_quantity_to_produce` :23-77, `_raw_material_requirements` :80-93, `suggest_purchases` :96-146, `compute_requirements` :149-193); frontend `mrp/MrpPage.tsx` (read-only), `api/mrp.ts`, `types/mrp.ts` | Yes — `GET /api/mrp` mounted; reused by `feasibility_service` and `purchase_order_service.auto_draft_from_mrp_shortages` | Yes, directly | Read-only/computed-on-the-fly by design (no persisted run history) — this is a design choice, not a defect |
| Machine master | Yes | `backend/app/models/machine.py`; `backend/app/api/machines.py` (generic CRUD); frontend `machines/MachinesListPage.tsx`, `MachineFormPage.tsx` | Yes — actively read by `capacity_service`, `feasibility_service`, `production_readiness_service` | Yes, as-is, **if single-machine scope is acceptable** | Hard-coded to exactly one record (`MachineCRUD.create`, `crud/master_data.py:258-263`); one scalar `capacity_hours_per_day`, no maintenance windows, no product↔machine many-to-many (it's a single nullable FK on `Product` instead) |
| Production scheduling | Yes | `backend/app/models/production_schedule.py`; `backend/app/services/production_service.py`; `backend/app/services/capacity_service.py` (vacant-slot scan, shared with feasibility); `backend/app/services/production_readiness_service.py`; frontend `production/ProductionListPage.tsx`, `ProductionFormPage.tsx`, `ProductionReadinessPanel.tsx` | Yes, fully, including auto-scheduling on order confirmation | Yes, directly | A batch ties to one whole `Order` + one `Product`, not an order line — see Production Order boundary discussion |
| Production execution | Yes | `production_service.log_partial_production`, `log_production`, `_record_output` (:345-573); frontend `production/LogProductionModal.tsx`, `ProductionDetailPage.tsx` Execution tab | Yes | Yes, directly | None identified |
| Production completion | Yes | `production_service.change_status(..., "completed", ...)`; auto-advances linked order via `_maybe_advance_order_to_ready_to_ship` (:748-782) | Yes | Yes | None identified |
| Rejection/wastage | Partial | `material_discrepancy_flag`/`material_discrepancy_notes` on `ProductionSchedule` (raw-material scrap-allowance breach only, from `_record_output`'s comparison of actual vs. BOM `net_required`/`scrap_inflated_required`); `Product.inspection_required`/`qc_notes` are static per-product flags, not per-run | Yes, for what exists | The discrepancy-detection *pattern* is reusable | Real gap — no rejected/scrapped finished-unit quantity field, no QC pass/fail record per batch, no formal "wastage" concept for finished output (only raw-material consumption variance) |
| Finished goods stock | Yes | `FinishedGoodsInventory`; `inventory_service.get_finished_goods_stock`; frontend `inventory/InventoryPage.tsx` (Finished Goods panel) | Yes — incremented on every production output log (partial or final), decremented on shipment | Yes, directly | No standalone "Finished Goods" route (it's a panel inside Inventory) — organizational, not a missing capability |
| Order fulfilment tracking | Yes | `Order.status` progression (draft→confirmed→in_production→ready_to_ship→shipped→delivered), auto-advanced by batch start/complete; frontend `orders/OrderJourney.tsx` | Yes | Yes | Per-line fulfilment (e.g. partial shipment of one line within a multi-line order) is not separately tracked beyond whole-order splitting |
| Delivery integration | Yes | `backend/app/services/delivery_note_service.py`; `backend/app/api/delivery_notes.py`; frontend `deliveryNotes/*` | Yes | Yes | Same packaging gap as above — packaging stock is not deducted at delivery either |

---

## 2. What Genuinely Does Not Exist

Confirmed by a full case-insensitive keyword sweep of `backend/` (see raw
research notes) — these concepts have **zero** hits as actual code entities:

- `work_order` — no such table/model/name anywhere. The closest analog is
  `ProductionSchedule` ("batch").
- `material_issue` — consumption is recorded as a generic
  `StockMovement.movement_type == "issue"`, not a named `material_issue` entity.
- `material_allocation` / `material_reservation` — no dedicated table; the real
  mechanism is the generic `quantity_reserved` column (see reservation row
  above). `allocate_alternative_coverage` in
  `raw_material_alternative_service.py` is unrelated — it distributes a
  shortfall across approved *substitute materials*, not stock to orders/batches.
- `manufacturing` — only generic branding text ("Manufacturing ERP" in
  `config.py`/`README.md`/`schema.sql` header); no module/table by this name.
- `finished_goods` as a distinct module — it is exactly the
  `finished_goods_inventory` table already covered above, not a separate
  concept.

## 3. Confidence

Every finding above was independently confirmed twice: once via direct model/
service reads and once via reference-tracing (who actually calls this code,
who imports it, is it mounted in `app/main.py`'s router list). Nothing above
is dead code — every model/service/migration cited is imported and exercised
by a mounted API router.

See `docs/production-lifecycle.md` for the target architecture and the
Production Order boundary proposal, and `docs/production-inventory-integration.md`
for the inventory/BOM/MRP deep-dive.
