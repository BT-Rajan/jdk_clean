from datetime import datetime

from pydantic import BaseModel


class TemplateFieldOut(BaseModel):
    key: str
    label: str


class RepeatingFieldsOut(BaseModel):
    loop_name: str
    item_label: str
    fields: list[TemplateFieldOut]


class DocTemplateSlotOut(BaseModel):
    doc_type: str
    doc_type_label: str
    language: str
    language_label: str
    is_custom: bool
    original_filename: str | None = None
    updated_at: datetime | None = None
    placeholders: str
    # Structured versions of `placeholders`, for the field-mapping
    # editor's clickable field list -- see doc_template_service._fields_for.
    simple_fields: list[TemplateFieldOut]
    repeating: RepeatingFieldsOut


class DocTemplateHtmlOut(BaseModel):
    html: str


class DocTemplateHtmlIn(BaseModel):
    html: str
