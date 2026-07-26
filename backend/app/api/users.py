from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import ListParams, require_role
from app.core.database import get_db
from app.core.security import hash_password
from app.crud.master_data import user_crud
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import audit_service

router = APIRouter(prefix="/api/users", tags=["users"])
admin_only = require_role("admin")


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
    result["items"] = [UserOut.model_validate(u) for u in result["items"]]
    return result


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return user_crud.read_one(db, user_id)


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
    return user_crud.create(db, data, user_id=current_user.id)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    data = payload.model_dump(exclude_unset=True)
    return user_crud.update(db, user_id, data, user_id=current_user.id)


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
    return user_crud.restore(db, user_id, user_id=current_user.id)
