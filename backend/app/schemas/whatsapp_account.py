from datetime import datetime

from pydantic import BaseModel, Field


class WhatsAppAccountOut(BaseModel):
    id: int | None = None
    phone_number_id: str
    waba_id: str
    display_phone_number: str
    verified_name: str
    has_token: bool  # never the real token itself
    api_version: str
    is_active: bool
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None
    last_test_error: str | None = None


class WhatsAppAccountUpdate(BaseModel):
    phone_number_id: str = Field(default="", max_length=64)
    waba_id: str = Field(default="", max_length=64)
    api_version: str = Field(default="v21.0", max_length=10)
    # Omitted/None keeps the previously saved token (same convention as
    # email/sms). Empty string explicitly clears it.
    access_token: str | None = None
    is_active: bool = True


class WhatsAppTestResult(BaseModel):
    ok: bool
    message: str


class WhatsAppTemplateComponent(BaseModel):
    type: str
    text: str | None = None
    variable_count: int = 0


class WhatsAppTemplate(BaseModel):
    """An APPROVED template as returned by Meta -- never hand-typed by
    an admin, always fetched live from /{waba_id}/message_templates."""
    name: str
    language: str
    category: str
    status: str
    components: list[WhatsAppTemplateComponent] = []


class WhatsAppSendTemplateRequest(BaseModel):
    to: str = Field(min_length=6, max_length=20)
    template_name: str = Field(min_length=1, max_length=512)
    language: str = Field(min_length=2, max_length=10)
    # Body placeholder values, in order ({{1}}, {{2}}, ...). Header/
    # footer variables aren't supported yet -- see service docstring.
    body_params: list[str] = []
