from app.api.common import build_crud_router
from app.crud.master_data import product_crud
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate

router = build_crud_router(
    crud=product_crud,
    create_schema=ProductCreate,
    update_schema=ProductUpdate,
    out_schema=ProductOut,
    prefix="/api/products",
    tags=["products"],
)
