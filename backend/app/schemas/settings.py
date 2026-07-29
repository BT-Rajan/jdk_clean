from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    company_name: str
    company_address: str
    company_phone: str
    company_email: str
    company_gstin: str
    ai_provider: str
    ai_api_key: str  # masked (e.g. "••••••••ab12"), never the real value
    # Factory-wide worker pool -- used alongside each machine's own
    # capacity by the feasibility check's capacity scan.
    factory_total_workers: str
    factory_workday_hours: str


class SettingsUpdate(BaseModel):
    company_name: str | None = None
    company_address: str | None = None
    company_phone: str | None = None
    company_email: str | None = None
    company_gstin: str | None = None
    ai_provider: str | None = Field(default=None, pattern="^(|claude|deepseek)$")
    ai_api_key: str | None = None
    factory_total_workers: str | None = None
    factory_workday_hours: str | None = None
