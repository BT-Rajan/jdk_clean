from typing import Literal

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.user import User
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services import company_logo_service, settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"])
admin_only = require_role("admin")

# Mirrors settings_service.LOGO_VARIANTS -- a Literal path param means
# FastAPI/Pydantic reject any other value with a plain 422 before the
# request ever reaches company_logo_service, rather than relying on that
# service's own variant check alone.
LogoVariant = Literal["dark_english", "dark_arabic", "light_english", "light_arabic"]


@router.get("", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    return settings_service.get_masked(db)


@router.put("", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    data = payload.model_dump(exclude_unset=True)
    return settings_service.update(db, data)


@router.post("/logo/{variant}", response_model=SettingsOut)
async def upload_company_logo(
    variant: LogoVariant,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    raw_bytes = await file.read()
    return company_logo_service.save_logo(db, variant, raw_bytes)


@router.delete("/logo/{variant}", response_model=SettingsOut)
def remove_company_logo(
    variant: LogoVariant,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    return company_logo_service.delete_logo(db, variant)


@router.get("/logo/{variant}")
def get_company_logo(
    variant: LogoVariant,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    path = company_logo_service.get_logo_path(db, variant)
    if path is None:
        raise NotFoundError("Logo")
    media_type = "image/png" if path.suffix == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media_type)
