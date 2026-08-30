import csv
import io

from fastapi import Depends
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.api.deps import require_role
from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.permissions import require_page_access
from app.crud.master_data import product_crud
from app.models.product import Product
from app.models.user import User
from app.schemas.product import (
    ProductCreate,
    ProductImportRequest,
    ProductImportResult,
    ProductImportRowResult,
    ProductOut,
    ProductUpdate,
)
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

read_guard = require_page_access("products", "read")
write_guard = require_page_access("products", "write")
# Hard role gate, not department-permission-based like the rest of this
# router: supplier terms/pricing are commercially sensitive, so this
# stays admin-only regardless of anyone's "products" page permission.
admin_guard = require_role("admin")

# Column layout shared by export and import -- export writes exactly
# these headers, and the import dialog's column-mapping step (frontend)
# is built to auto-match against this same list, so a round-tripped
# export-edit-reimport needs no remapping. tags/properties are
# deliberately left out: both are free-form JSON/list-shaped and
# descriptive-only (not read by feasibility/BOM/capacity logic, see the
# Product model), so encoding them into a flat CSV cell isn't worth the
# complexity here -- they stay editable through the product form/API.
IMPORT_EXPORT_COLUMNS = [
    "code",
    "name",
    "unit",
    "product_type",
    "selling_price",
    "batch_size",
    "batch_production_hours",
    "machine_id",
    "production_hours_per_unit",
    "workers_required",
    "status",
    "reorder_point",
]


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


def _product_to_csv_row(p: Product) -> dict:
    return {
        "code": p.code,
        "name": p.name,
        "unit": p.unit,
        "product_type": p.product_type,
        "selling_price": p.selling_price,
        "batch_size": p.batch_size if p.batch_size is not None else "",
        "batch_production_hours": p.batch_production_hours if p.batch_production_hours is not None else "",
        "machine_id": p.machine_id if p.machine_id is not None else "",
        "production_hours_per_unit": (
            p.production_hours_per_unit if p.production_hours_per_unit is not None else ""
        ),
        "workers_required": p.workers_required if p.workers_required is not None else "",
        "status": p.status,
        "reorder_point": p.reorder_point,
    }


@router.get("/export")
def export_products(
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """CSV of every active product (soft-deleted excluded, same as the
    list endpoint) in the same column layout /import expects back --
    for bulk editing offline, or seeding another environment."""
    products = (
        db.query(Product).filter(Product.deleted_at.is_(None)).order_by(Product.code).all()
    )
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=IMPORT_EXPORT_COLUMNS)
    writer.writeheader()
    for p in products:
        writer.writerow(_product_to_csv_row(p))

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=products.csv"},
    )


def _format_import_error(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        first = exc.errors()[0]
        field = ".".join(str(p) for p in first["loc"])
        return f"{field}: {first['msg']}" if field else first["msg"]
    if isinstance(exc, AppError):
        return exc.message
    return str(exc) or "Could not import this row."


@router.post("/import", response_model=ProductImportResult)
def import_products(
    payload: ProductImportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Bulk create/update by `code`: a row whose code already matches an
    existing (non-deleted) product updates it (only the columns present
    on that row -- see ProductImportRow), any other code creates a new
    product. Rows are processed and committed one at a time so a single
    bad row (a validation error, a duplicate code within the same file)
    doesn't fail the whole batch -- the per-row result list is how the
    caller finds out which ones didn't take.

    Expects already-mapped, structured rows (frontend's column-mapping
    step turns raw CSV columns into these named fields) rather than raw
    CSV text, so this endpoint has no CSV-parsing/upload-file handling
    of its own.
    """
    created = updated = errors = 0
    results: list[ProductImportRowResult] = []

    for idx, row in enumerate(payload.rows, start=1):
        # Normalized once up front so it's always a plain string for the
        # DB lookup below and for the result row -- ProductImportRow
        # leaves code optional/unconstrained (see that schema's
        # docstring), so a missing/blank code here still gets a real
        # per-row error message via ProductCreate's own validation below
        # (min_length=1) rather than crashing this loop.
        code = (row.code or "").strip()
        try:
            data = {
                k: v
                for k, v in row.model_dump().items()
                if k != "code" and v is not None
            }
            existing = (
                db.query(Product)
                .filter(Product.code == code, Product.deleted_at.is_(None))
                .first()
            )
            if existing:
                validated_update = ProductUpdate(**data)
                product_crud.update(
                    db, existing.id, validated_update.model_dump(exclude_unset=True), user_id=user.id
                )
                action = "updated"
                updated += 1
            else:
                validated_create = ProductCreate(**{**data, "code": code})
                product_crud.create(db, validated_create.model_dump(), user_id=user.id)
                action = "created"
                created += 1
            results.append(ProductImportRowResult(row=idx, code=code, action=action))
        except IntegrityError:
            db.rollback()
            errors += 1
            results.append(
                ProductImportRowResult(
                    row=idx, code=code, action="error", message="A product with this code already exists."
                )
            )
        except (ValidationError, AppError) as exc:
            db.rollback()
            errors += 1
            results.append(
                ProductImportRowResult(row=idx, code=code, action="error", message=_format_import_error(exc))
            )

    return ProductImportResult(created=created, updated=updated, errors=errors, results=results)
