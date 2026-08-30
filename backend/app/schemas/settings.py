from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    company_name: str
    company_address: str
    company_phone: str
    company_email: str
    company_gstin: str
    # Uploaded logo filenames, one per theme x language variant -- "" if
    # that variant hasn't been uploaded yet. Set only via
    # POST/DELETE /api/settings/logo/{variant}, never through this
    # schema's Update counterpart. See settings_service.LOGO_VARIANTS.
    company_logo_dark_english_filename: str
    company_logo_dark_arabic_filename: str
    company_logo_light_english_filename: str
    company_logo_light_arabic_filename: str
    # "" (none selected yet) or one of the four variant names above --
    # which uploaded logo is actually the active one.
    company_logo_active: str
    ai_api_key: str  # masked (e.g. "••••••••ab12"), never the real value
    # Factory-wide worker pool -- used alongside each machine's own
    # capacity by the feasibility check's capacity scan.
    factory_total_workers: str
    factory_workday_hours: str
    # Comma-separated 3-letter day codes, e.g. "Sun,Mon,Tue,Wed,Thu" --
    # which days the factory runs. Used by the feasibility check's
    # capacity scan (and order-confirm auto-scheduling) to skip
    # non-working days. See settings_service.get_working_days.
    factory_working_days: str
    # 'true' or 'false' (stored as text like every setting). See
    # settings_service.is_auto_create_quotation_enabled.
    auto_create_quotation_from_feasibility: str
    # 'true' or 'false'. See settings_service.is_auto_schedule_production_enabled.
    auto_schedule_production_on_order_confirm: str
    # 'true' or 'false'. See settings_service.is_auto_create_delivery_note_enabled.
    auto_create_delivery_note_on_ready_to_ship: str
    # 'true' or 'false'. See settings_service.is_auto_draft_purchase_orders_enabled.
    auto_draft_purchase_orders_from_mrp: str
    # Percentage, e.g. "0" or "5". Kuwait has no GST/VAT -- defaults to 0,
    # provisioned for later. See settings_service.get_default_tax_rate.
    default_tax_rate: str
    # KWD amount, or "" to disable. A PO at/above this can't be sent
    # until an admin approves it. See settings_service.
    # get_large_po_approval_threshold.
    large_po_approval_threshold: str
    # Percentage, or "" to disable. A document-level discount, or any
    # single line's discount, at/above this can't leave draft until an
    # admin approves it. See settings_service.
    # get_large_discount_approval_threshold.
    large_discount_approval_threshold: str


class SettingsUpdate(BaseModel):
    company_name: str | None = None
    company_address: str | None = None
    company_phone: str | None = None
    company_email: str | None = None
    company_gstin: str | None = None
    company_logo_active: str | None = Field(
        default=None, pattern="^(dark_english|dark_arabic|light_english|light_arabic|)$"
    )
    ai_api_key: str | None = None
    factory_total_workers: str | None = None
    factory_workday_hours: str | None = None
    factory_working_days: str | None = None
    auto_create_quotation_from_feasibility: str | None = Field(default=None, pattern="^(true|false)$")
    auto_schedule_production_on_order_confirm: str | None = Field(default=None, pattern="^(true|false)$")
    auto_create_delivery_note_on_ready_to_ship: str | None = Field(default=None, pattern="^(true|false)$")
    auto_draft_purchase_orders_from_mrp: str | None = Field(default=None, pattern="^(true|false)$")
    default_tax_rate: str | None = None
    large_po_approval_threshold: str | None = None
    large_discount_approval_threshold: str | None = None
