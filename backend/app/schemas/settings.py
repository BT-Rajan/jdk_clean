from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    company_name: str
    company_address: str
    company_phone: str
    company_email: str
    company_gstin: str
    ai_provider: str
    ai_api_key: str  # masked (e.g. "••••••••ab12"), never the real value


class SettingsUpdate(BaseModel):
    company_name: str | None = None
    company_address: str | None = None
    company_phone: str | None = None
    company_email: str | None = None
    company_gstin: str | None = None
    ai_provider: str | None = Field(default=None, pattern="^(|claude|deepseek)$")
    ai_api_key: str | None = None
