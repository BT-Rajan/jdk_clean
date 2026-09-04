from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class SmsAccountOut(BaseModel):
    id: int | None = None
    provider: str
    sender_id: str
    api_url: str
    api_username: str
    has_secret: bool  # never the real secret itself
    test_mode: bool
    is_active: bool
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None
    last_test_error: str | None = None


class SmsAccountUpdate(BaseModel):
    provider: str = Field(default="kwtsms", pattern="^(kwtsms|unifonic|smsala|custom)$")
    sender_id: str = Field(default="", max_length=20)
    api_url: str = Field(default="", max_length=255)
    api_username: str = Field(default="", max_length=255)
    # Omitted/None keeps the previously saved secret (same convention as
    # email_account's password field). Empty string explicitly clears it.
    api_secret: str | None = None
    test_mode: bool = True
    is_active: bool = True

    @field_validator("*", mode="before")
    @classmethod
    def _strip_strings(cls, v):
        return v.strip() if isinstance(v, str) else v


class SmsTestRequest(BaseModel):
    phone_number: str = Field(min_length=6, max_length=20)


class SmsTestResult(BaseModel):
    ok: bool
    message: str
