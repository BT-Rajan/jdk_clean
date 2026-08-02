from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.core.permissions import PAGE_KEYS
from app.models.user import User
from app.schemas.permission import PermissionEntry, PermissionMatrixUpdate
from app.services import permission_service

router = APIRouter(prefix="/api/permissions", tags=["permissions"])

admin_guard = require_role("admin", "manager")


@router.get("", response_model=list[PermissionEntry])
def get_matrix(db: Session = Depends(get_db), user: User = Depends(admin_guard)):
    return permission_service.get_matrix(db)


@router.get("/pages")
def list_pages(user: User = Depends(get_current_user)):
    """The fixed list of governable pages, for the frontend grid's
    column headers -- any authenticated user can see the list of page
    names (not a secret), only admin/manager can see or change the
    actual matrix."""
    return {"pages": list(PAGE_KEYS)}


@router.get("/me")
def get_my_permissions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Any authenticated user's own effective access per page -- used
    by the frontend to decide what to route to and show in nav, without
    needing admin rights to see the whole department matrix."""
    return permission_service.compute_effective_permissions(db, user)


@router.put("", response_model=list[PermissionEntry])
def update_matrix(
    payload: PermissionMatrixUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    return permission_service.set_matrix(db, [e.model_dump() for e in payload.entries], user_id=user.id)
