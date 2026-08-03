from sqlalchemy.orm import Session

from app.models.setting import Setting

COMPANY_FIELDS = ["company_name", "company_address", "company_phone", "company_email", "company_gstin"]
# The AI API key (Claude or DeepSeek). Which provider it belongs to is
# auto-detected server-side from the key's own format (see
# assistant_service._detect_provider) -- there's no separate stored
# choice or admin picker for it anymore.
AI_FIELDS = ["ai_api_key"]
# The factory-wide worker pool used alongside each machine's own capacity
# in the feasibility check's capacity scan (see feasibility_service.py).
# Stored as text like every other setting; parsed by whoever reads them.
FACTORY_FIELDS = ["factory_total_workers", "factory_workday_hours"]
# Sales workflow: whether a passed/exception-approved feasibility check
# automatically drafts a quotation, or just becomes eligible for one that
# Sales creates by hand as before. Admin/manager-only to change (see
# api/settings.py's write guard) -- this is the "role-based override" on
# the auto-create-with-flexibility behavior: the automation itself is
# role-gated at the settings level, and any quotation it drafts is a
# completely normal, editable/deletable record afterward regardless.
SALES_FIELDS = ["auto_create_quotation_from_feasibility"]
# Production workflow: the same auto-create-with-override pattern, one
# joint further along -- whether confirming an order automatically
# schedules a production batch (using the same vacant-slot capacity scan
# as the feasibility check) for each line whose product has a machine/
# time formula set, or just leaves scheduling to be done by hand as before.
PRODUCTION_FIELDS = ["auto_schedule_production_on_order_confirm"]
# Last joint in the pipeline: once an order is ready to ship (whether a
# person set that directly, or production auto-advanced it once every
# batch completed), whether the system drafts a delivery note
# automatically -- delivery_date defaulted to today, adjustable
# afterward -- or leaves it for Sales/Warehouse to create by hand.
DELIVERY_FIELDS = ["auto_create_delivery_note_on_ready_to_ship"]
# Procurement workflow: whether an MRP-identified raw material shortage
# automatically drafts a purchase order (grouped by supplier, using the
# same supplier-suggestion logic the MRP report itself already shows) --
# always landing in 'draft', never sent automatically -- or is left for
# Procurement to act on by hand from the MRP report as before.
PROCUREMENT_FIELDS = ["auto_draft_purchase_orders_from_mrp"]
# Kuwait has no GST/VAT today -- this exists so tax can be switched on
# later (a rate change, a law change) without any schema or workflow
# rework, not because it's active now. Stored as a percentage string,
# e.g. "0" or "5"; every quotation/order/purchase order defaults to this
# rate at creation (still overridable per document).
TAX_FIELDS = ["default_tax_rate"]
# Large-PO admin approval: a PO at or above this amount (in KWD) can't be
# sent to its supplier until an admin approves it (see purchase_order_
# service.approve_purchase_order). Empty/unset means the gate is off --
# admin has to explicitly set a threshold to turn it on.
APPROVAL_FIELDS = ["large_po_approval_threshold"]
# Large-discount admin approval: a document (quotation, order, or
# purchase order) whose document-level discount_percent, or any single
# line's discount_percent, is at or above this percentage can't leave
# 'draft' until an admin approves it. Empty/unset means the gate is off.
DISCOUNT_APPROVAL_FIELDS = ["large_discount_approval_threshold"]
ALL_FIELDS = (
    COMPANY_FIELDS
    + AI_FIELDS
    + FACTORY_FIELDS
    + SALES_FIELDS
    + PRODUCTION_FIELDS
    + DELIVERY_FIELDS
    + PROCUREMENT_FIELDS
    + TAX_FIELDS
    + APPROVAL_FIELDS
    + DISCOUNT_APPROVAL_FIELDS
)

DEFAULTS = {key: "" for key in ALL_FIELDS}
# factory_workday_hours defaults to a standard shift length rather than
# empty, since 0 would make every worker-hours check fail as "no capacity"
# for factories that haven't touched this setting yet.
DEFAULTS["factory_workday_hours"] = "8"
# Auto-create/auto-schedule default ON -- this is the behavior actually
# being asked for; an admin who wants the old fully-manual flow can
# switch any of these off independently.
DEFAULTS["auto_create_quotation_from_feasibility"] = "true"
DEFAULTS["auto_schedule_production_on_order_confirm"] = "true"
DEFAULTS["auto_create_delivery_note_on_ready_to_ship"] = "true"
DEFAULTS["auto_draft_purchase_orders_from_mrp"] = "true"
# 0% -- Kuwait has no GST/VAT. Provisioned, not active.
DEFAULTS["default_tax_rate"] = "0"


def get_all(db: Session) -> dict:
    rows = db.query(Setting).filter(Setting.setting_key.in_(ALL_FIELDS)).all()
    values = dict(DEFAULTS)
    for row in rows:
        if row.setting_value is not None:
            values[row.setting_key] = row.setting_value
    return values


def get_masked(db: Session) -> dict:
    """Same as get_all, but the AI API key is masked to its last 4 chars --
    mirrors the pattern your reference implementation uses. The full value
    is never sent back to the client after it's been saved once."""
    values = get_all(db)
    if values["ai_api_key"]:
        values["ai_api_key"] = "••••••••" + values["ai_api_key"][-4:]
    return values


def get_factory_labor_pool(db: Session) -> tuple[int, float]:
    """(total_workers, workday_hours) for the feasibility check's capacity
    scan. Unset/unparseable values default to (0, 8.0) -- 0 workers means
    the worker-hours side of the capacity check is simply skipped (same
    "not evaluable" treatment as a product with no machine/formula set),
    rather than erroring.
    """
    values = get_all(db)
    try:
        total_workers = int(values["factory_total_workers"])
    except (ValueError, KeyError):
        total_workers = 0
    try:
        workday_hours = float(values["factory_workday_hours"])
    except (ValueError, KeyError):
        workday_hours = 8.0
    return max(total_workers, 0), max(workday_hours, 0.0)


def is_auto_create_quotation_enabled(db: Session) -> bool:
    values = get_all(db)
    return values.get("auto_create_quotation_from_feasibility", "true").strip().lower() in ("true", "1", "yes")


def is_auto_schedule_production_enabled(db: Session) -> bool:
    values = get_all(db)
    return values.get("auto_schedule_production_on_order_confirm", "true").strip().lower() in ("true", "1", "yes")


def is_auto_create_delivery_note_enabled(db: Session) -> bool:
    values = get_all(db)
    return values.get("auto_create_delivery_note_on_ready_to_ship", "true").strip().lower() in ("true", "1", "yes")


def is_auto_draft_purchase_orders_enabled(db: Session) -> bool:
    values = get_all(db)
    return values.get("auto_draft_purchase_orders_from_mrp", "true").strip().lower() in ("true", "1", "yes")


def get_default_tax_rate(db: Session) -> float:
    values = get_all(db)
    try:
        return max(float(values.get("default_tax_rate", "0")), 0.0)
    except ValueError:
        return 0.0


def get_large_po_approval_threshold(db: Session) -> float | None:
    """None means the large-PO approval gate is off -- admin hasn't set a
    threshold. A set value of 0 would gate *everything*, which is
    presumably never intended, so an empty/unparseable setting is
    treated the same as "off" rather than "gate at zero"."""
    values = get_all(db)
    raw = values.get("large_po_approval_threshold", "").strip()
    if not raw:
        return None
    try:
        threshold = float(raw)
    except ValueError:
        return None
    return threshold if threshold > 0 else None


def get_large_discount_approval_threshold(db: Session) -> float | None:
    """Same off-by-default semantics as get_large_po_approval_threshold,
    but a percentage (e.g. 15 for 15%) rather than a KWD amount."""
    values = get_all(db)
    raw = values.get("large_discount_approval_threshold", "").strip()
    if not raw:
        return None
    try:
        threshold = float(raw)
    except ValueError:
        return None
    return threshold if threshold > 0 else None


def update(db: Session, data: dict) -> dict:
    """Writes only the keys present in `data`. A masked ai_api_key value
    (starting with the bullet prefix) means the caller didn't actually
    change it -- e.g. they edited company_name and resubmitted the whole
    form including the masked placeholder -- so it's left untouched
    rather than being saved literally as "••••••••1234".
    """
    for key, value in data.items():
        if key not in ALL_FIELDS or value is None:
            continue
        if key == "ai_api_key" and value.startswith("••••"):
            continue

        row = db.query(Setting).filter(Setting.setting_key == key).first()
        if row is None:
            row = Setting(setting_key=key, setting_value=value)
            db.add(row)
        else:
            row.setting_value = value

    db.commit()
    return get_masked(db)
