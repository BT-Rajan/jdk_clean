from app.api.common import build_crud_router
from app.crud.master_data import supplier_crud
from app.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate

router = build_crud_router(
    crud=supplier_crud,
    create_schema=SupplierCreate,
    update_schema=SupplierUpdate,
    out_schema=SupplierOut,
    prefix="/api/suppliers",
    tags=["suppliers"],
)
