from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.email_template import EmailTemplateOut, EmailTemplateUpdate
from app.services import email_template_service

router = APIRouter(prefix="/api/email-templates", tags=["email-templates"])
# Governance, same as Communication's account settings -- not gated by
# the department_permissions matrix, admin-only regardless of department.
admin_guard = require_role("admin")


@router.get("", response_model=list[EmailTemplateOut])
def list_email_templates(
    db: Session = Depends(get_db),
    _: User = Depends(admin_guard),
):
    return [EmailTemplateOut.from_model(t) for t in email_template_service.list_templates(db)]


@router.get("/{template_key}", response_model=EmailTemplateOut)
def get_email_template(
    template_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(admin_guard),
):
    return EmailTemplateOut.from_model(email_template_service.get_template(db, template_key))


@router.put("/{template_key}", response_model=EmailTemplateOut)
def update_email_template(
    template_key: str,
    payload: EmailTemplateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    template = email_template_service.update_template(db, template_key, payload.model_dump(), user_id=user.id)
    return EmailTemplateOut.from_model(template)
