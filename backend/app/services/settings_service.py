from sqlalchemy.orm import Session

from app.models.setting import Setting

COMPANY_FIELDS = ["company_name", "company_address", "company_phone", "company_email", "company_gstin"]
# ai_provider is 'claude' or 'deepseek' (or '' for not configured yet). The
# frontend never shows either name outside the admin-only settings screen
# (see SettingsPage.tsx) -- the chat feature itself just says "AI Assistant".
AI_FIELDS = ["ai_provider", "ai_api_key"]
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
ALL_FIELDS = COMPANY_FIELDS + AI_FIELDS + FACTORY_FIELDS + SALES_FIELDS + PRODUCTION_FIELDS

DEFAULTS = {key: "" for key in ALL_FIELDS}
# factory_workday_hours defaults to a standard shift length rather than
# empty, since 0 would make every worker-hours check fail as "no capacity"
# for factories that haven't touched this setting yet.
DEFAULTS["factory_workday_hours"] = "8"
# Auto-create/auto-schedule default ON -- this is the behavior actually
# being asked for; an admin who wants the old fully-manual flow can
# switch either off independently.
DEFAULTS["auto_create_quotation_from_feasibility"] = "true"
DEFAULTS["auto_schedule_production_on_order_confirm"] = "true"


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
