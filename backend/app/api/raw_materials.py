from app.api.common import build_crud_router
from app.crud.master_data import raw_material_crud
from app.schemas.raw_material import RawMaterialCreate, RawMaterialOut, RawMaterialUpdate

router = build_crud_router(
    crud=raw_material_crud,
    create_schema=RawMaterialCreate,
    update_schema=RawMaterialUpdate,
    out_schema=RawMaterialOut,
    prefix="/api/raw-materials",
    tags=["raw-materials"],
    page_key="raw_materials",
)
