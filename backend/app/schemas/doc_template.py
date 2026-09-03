from datetime import datetime

from pydantic import BaseModel


class DocTemplateSlotOut(BaseModel):
    doc_type: str
    doc_type_label: str
    language: str
    language_label: str
    is_custom: bool
    original_filename: str | None = None
    updated_at: datetime | None = None
    placeholders: str
