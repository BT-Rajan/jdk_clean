from fastapi import Depends
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.api.deps import require_role
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.crud.master_data import product_crud
from app.models.user import User
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate
from app.services import product_supplier_service

router = build_crud_router(
    crud=product_crud,
    create_schema=ProductCreate,
    update_schema=ProductUpdate,
    out_schema=ProductOut,
    prefix="/api/products",
    tags=["products"],
    page_key="products",
)

write_guard = require_page_access("products", "write")
# Hard role gate, not department-permission-based like the rest of this
# router: supplier terms/pricing are commercially sensitive, so this
# stays admin-only regardless of anyone's "products" page permission.
admin_guard = require_role("admin")


@router.post("/{product_id}/activate", response_model=ProductOut)
def activate_product(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Thin convenience wrapper around PUT .../status -- same effect, but a
    one-click action instead of opening the edit form just to flip a flag."""
    return product_crud.update(db, product_id, {"status": "active"}, user_id=user.id)


@router.post("/{product_id}/deactivate", response_model=ProductOut)
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return product_crud.update(db, product_id, {"status": "inactive"}, user_id=user.id)


@router.get("/{product_id}/suppliers")
def get_product_suppliers(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_guard),
):
    """Suppliers for the raw materials this product's BOM resolves to
    (explored through any sub-assembly levels), plus each raw material's
    default supplier. Admin-only regardless of department permissions --
    supplier terms/pricing are commercially sensitive, unlike the rest of
    the product record."""
    return product_supplier_service.get_suppliers_for_product(db, product_id)
