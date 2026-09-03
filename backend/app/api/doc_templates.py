from typing import Literal

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.doc_template import DocTemplateSlotOut
from app.services import doc_template_service

router = APIRouter(prefix="/api/doc-templates", tags=["doc-templates"])
# Governance, same as Email Templates -- not gated by the
# department_permissions matrix, admin-only regardless of department.
admin_guard = require_role("admin")

# Mirrors doc_template_service.DOC_TYPES/LANGUAGES -- a Literal path
# param means FastAPI/Pydantic reject any other value with a plain 422
# before the request ever reaches the service, same trick settings.py's
# LogoVariant uses.
DocType = Literal["feasibility", "quotation", "order", "delivery_note"]
Language = Literal["en", "ar"]


@router.get("", response_model=list[DocTemplateSlotOut])
def list_doc_templates(
    db: Session = Depends(get_db),
    _: User = Depends(admin_guard),
):
    return doc_template_service.list_templates(db)


@router.get("/{doc_type}/{language}/download")
def download_doc_template(
    doc_type: DocType,
    language: Language,
    db: Session = Depends(get_db),
    _: User = Depends(admin_guard),
):
    raw_bytes = doc_template_service.read_active_template_bytes(db, doc_type, language)
    return Response(
        content=raw_bytes,
        media_type=doc_template_service.DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{doc_type}_{language}.docx"'},
    )


@router.post("/{doc_type}/{language}", response_model=DocTemplateSlotOut)
async def upload_doc_template(
    doc_type: DocType,
    language: Language,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    raw_bytes = await file.read()
    return doc_template_service.upload_template(
        db, doc_type, language, raw_bytes, file.filename or "template.docx", user_id=user.id
    )


@router.delete("/{doc_type}/{language}", response_model=DocTemplateSlotOut)
def reset_doc_template(
    doc_type: DocType,
    language: Language,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    return doc_template_service.reset_template(db, doc_type, language, user_id=user.id)
