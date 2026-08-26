from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.email_account import EmailAccountOut, EmailAccountTestResult, EmailAccountUpdate
from app.schemas.sms_account import SmsAccountOut, SmsAccountUpdate, SmsTestRequest, SmsTestResult
from app.services import email_account_service, sms_account_service

router = APIRouter(prefix="/api/communication", tags=["communication"])
admin_only = require_role("admin")


@router.get("/email/providers")
def list_email_providers(_: User = Depends(admin_only)):
    """Preset host/port values per provider, for the frontend's provider
    picker to fill the form with on selection -- see PROVIDER_PRESETS."""
    return email_account_service.PROVIDER_PRESETS


@router.get("/email", response_model=EmailAccountOut)
def get_email_account(
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    return email_account_service.get(db)


@router.put("/email", response_model=EmailAccountOut)
def update_email_account(
    payload: EmailAccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(admin_only),
):
    return email_account_service.update(db, payload.model_dump(), user.id)


@router.post("/email/test", response_model=EmailAccountTestResult)
def test_email_account(
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    return email_account_service.test_connection(db)


@router.get("/sms/providers")
def list_sms_providers(_: User = Depends(admin_only)):
    """Preset API URLs and field labels per operator, for the frontend's
    provider picker -- see sms_account_service.PROVIDER_PRESETS."""
    return sms_account_service.PROVIDER_PRESETS


@router.get("/sms", response_model=SmsAccountOut)
def get_sms_account(
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    return sms_account_service.get(db)


@router.put("/sms", response_model=SmsAccountOut)
def update_sms_account(
    payload: SmsAccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(admin_only),
):
    return sms_account_service.update(db, payload.model_dump(), user.id)


@router.post("/sms/test", response_model=SmsTestResult)
def test_sms_account(
    payload: SmsTestRequest,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    return sms_account_service.test_connection(db, payload.phone_number)
