from sqlalchemy.orm import Session

from app.models.setting import Setting

COMPANY_FIELDS = ["company_name", "company_address", "company_phone", "company_email", "company_gstin"]
# ai_provider is 'claude' or 'deepseek' (or '' for not configured yet). The
# frontend never shows either name outside the admin-only settings screen
# (see SettingsPage.tsx) -- the chat feature itself just says "AI Assistant".
AI_FIELDS = ["ai_provider", "ai_api_key"]
ALL_FIELDS = COMPANY_FIELDS + AI_FIELDS

DEFAULTS = {key: "" for key in ALL_FIELDS}


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
