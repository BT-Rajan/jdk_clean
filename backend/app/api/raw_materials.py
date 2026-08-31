from fastapi import Depends
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.crud.master_data import raw_material_crud
from app.models.user import User
from app.schemas.raw_material import RawMaterialCreate, RawMaterialOut, RawMaterialUpdate
from app.services import where_used_service

router = build_crud_router(
    crud=raw_material_crud,
    create_schema=RawMaterialCreate,
    update_schema=RawMaterialUpdate,
    out_schema=RawMaterialOut,
    prefix="/api/raw-materials",
    tags=["raw-materials"],
    page_key="raw_materials",
)

read_guard = require_page_access("raw_materials", "read")


@router.get("/{raw_material_id}/where-used")
def get_raw_material_where_used(
    raw_material_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """Read-only, computed from live relationships (BOMs, packaging,
    suppliers, purchase orders) -- see app/services/where_used_service.py."""
    raw_material_crud.read_one(db, raw_material_id)  # 404s if it doesn't exist
    return where_used_service.raw_material_usage(db, raw_material_id)
