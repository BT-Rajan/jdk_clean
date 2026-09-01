from datetime import datetime

from pydantic import BaseModel, Field


class EmailTemplateOut(BaseModel):
    id: int
    template_key: str
    name: str
    subject: str
    body: str
    placeholders: str = ""
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "EmailTemplateOut":
        from app.services.email_template_service import TEMPLATE_DEFINITIONS

        data = EmailTemplateOut.model_validate(obj)
        data.placeholders = TEMPLATE_DEFINITIONS.get(obj.template_key, {}).get("placeholders", "")
        return data


class EmailTemplateUpdate(BaseModel):
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)
