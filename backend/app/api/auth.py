from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
)
from app.schemas.user import MeOut, MeUpdate
from app.services import auth_service, profile_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _to_me_out(user: User) -> MeOut:
    return MeOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        avatar_url="/api/auth/me/avatar" if user.avatar_filename else None,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    tokens = auth_service.login(db, payload.username, payload.password)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    tokens = auth_service.refresh(db, payload.refresh_token)
    return tokens


@router.post("/logout")
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    auth_service.logout(db, payload.refresh_token)
    return {"message": "Logged out."}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    auth_service.change_password(db, current_user, payload.current_password, payload.new_password)
    return {"message": "Password changed. Please log in again."}


@router.get("/me", response_model=MeOut)
def me(current_user: User = Depends(get_current_user)):
    return _to_me_out(current_user)


@router.patch("/me", response_model=MeOut)
def update_me(
    payload: MeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = profile_service.update_profile(db, current_user, payload.full_name, payload.phone)
    return _to_me_out(user)


@router.post("/me/avatar", response_model=MeOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw_bytes = await file.read()
    user = profile_service.save_avatar(db, current_user, raw_bytes)
    return _to_me_out(user)


@router.delete("/me/avatar", response_model=MeOut)
def remove_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = profile_service.delete_avatar(db, current_user)
    return _to_me_out(user)


@router.get("/me/avatar")
def get_avatar(current_user: User = Depends(get_current_user)):
    path = profile_service.get_avatar_path(current_user)
    if path is None:
        raise NotFoundError("Avatar")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=60"})
