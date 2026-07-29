from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import ListParams, require_role
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.crud.master_data import user_crud
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import audit_service, signature_service

router = APIRouter(prefix="/api/users", tags=["users"])
admin_only = require_role("admin", "manager")


@router.get("", response_model=PagedResponse)
def list_users(
    params: ListParams = Depends(),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    result = user_crud.read_all(
        db,
        page=params.page,
        page_size=params.page_size,
        search=params.search,
        sort=params.sort,
        filters=params.filters,
    )
    result["items"] = [UserOut.from_model(u) for u in result["items"]]
    return result


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return UserOut.from_model(user_crud.read_one(db, user_id))


@router.get("/{user_id}/history")
def get_user_history(user_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    user_crud.read_one(db, user_id, include_deleted=True)
    return audit_service.get_history(db, "users", user_id)


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    data = payload.model_dump(exclude={"password"})
    data["password_hash"] = hash_password(payload.password)
    return UserOut.from_model(user_crud.create(db, data, user_id=current_user.id))


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    data = payload.model_dump(exclude_unset=True)
    return UserOut.from_model(user_crud.update(db, user_id, data, user_id=current_user.id))


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    user_crud.delete(db, user_id, user_id=current_user.id)
    return {"message": "Deleted."}


@router.post("/{user_id}/restore", response_model=UserOut)
def restore_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    return UserOut.from_model(user_crud.restore(db, user_id, user_id=current_user.id))


@router.post("/{user_id}/signature", response_model=UserOut)
async def upload_signature(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    target = signature_service.get_target_user(db, user_id)
    raw_bytes = await file.read()
    updated = signature_service.save_signature(db, current_user.id, target, raw_bytes)
    return UserOut.from_model(updated)


@router.delete("/{user_id}/signature", response_model=UserOut)
def remove_signature(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    target = signature_service.get_target_user(db, user_id)
    updated = signature_service.delete_signature(db, current_user.id, target)
    return UserOut.from_model(updated)


@router.get("/{user_id}/signature")
def get_signature(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    target = signature_service.get_target_user(db, user_id)
    path = signature_service.get_signature_path(target)
    if path is None:
        raise NotFoundError("Signature")
    media_type = "image/png" if path.suffix == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media_type)
