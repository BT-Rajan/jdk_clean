from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.models.raw_material import RawMaterial
from app.models.supplier_return import SupplierReturn, SupplierReturnLine
from app.services import audit_service, inventory_service, number_series_service

TABLE_NAME = "supplier_returns"

_SORTABLE_FIELDS = {
    "return_number": SupplierReturn.return_number,
    "return_date": SupplierReturn.return_date,
    "created_at": SupplierReturn.created_at,
}


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(SupplierReturn).options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.purchase_order),
        joinedload(SupplierReturn.creator),
        joinedload(SupplierReturn.lines).joinedload(SupplierReturnLine.raw_material),
    )
    if not include_deleted:
        query = query.filter(SupplierReturn.deleted_at.is_(None))
    return query


def get_supplier_return(db: Session, return_id: int, include_deleted: bool = False) -> SupplierReturn:
    obj = _base_query(db, include_deleted).filter(SupplierReturn.id == return_id).first()
    if obj is None:
        raise NotFoundError("Supplier return")
    return obj


def list_supplier_returns(
    db: Session,
    page: int = 1,
    page_size: int = 10,
    search: str | None = None,
    supplier_id: int | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)
    if supplier_id is not None:
        query = query.filter(SupplierReturn.supplier_id == supplier_id)
    if search:
        query = query.filter(SupplierReturn.return_number.ilike(f"%{search}%"))
    return sort_and_paginate(query, SupplierReturn, _SORTABLE_FIELDS, sort, page, page_size)


def _validate_lines(db: Session, lines: list[dict]) -> None:
    material_ids = {line["raw_material_id"] for line in lines}
    found_ids = {
        rid
        for (rid,) in db.query(RawMaterial.id)
        .filter(RawMaterial.id.in_(material_ids), RawMaterial.deleted_at.is_(None))
        .all()
    }
    missing = material_ids - found_ids
    if missing:
        raise ValidationAppError(f"Raw material {sorted(missing)[0]} not found.")


def create_supplier_return(db: Session, data: dict, user_id: int | None = None) -> SupplierReturn:
    """Records raw material sent back to a supplier -- a done deal, not a
    draft: the returned quantity comes off raw-material stock on hand the
    moment this is created (movement_type='return_to_supplier'), the same
    way issuing a delivery note immediately deducts finished-goods stock.
    Lines are validated up front so a bad line doesn't leave earlier ones
    already applied (adjust_stock commits per call -- see
    purchase_order_service.receive_lines for the same reasoning); a line
    quantity exceeding what's on hand still fails naturally at adjust_stock
    (stock is never allowed to go negative), so there's no separate
    availability check here.
    """
    lines = data.pop("lines")
    _validate_lines(db, lines)

    supplier_return = SupplierReturn(
        return_number=number_series_service.next_number(db, "SUPPLIER_RETURN"),
        created_by=user_id,
        **data,
    )
    db.add(supplier_return)
    db.flush()

    for line in lines:
        db.add(
            SupplierReturnLine(
                supplier_return_id=supplier_return.id,
                raw_material_id=line["raw_material_id"],
                quantity=line["quantity"],
            )
        )
    db.flush()

    for line in lines:
        inventory_service.adjust_stock(
            db,
            item_type="raw_material",
            item_id=line["raw_material_id"],
            quantity=-float(line["quantity"]),
            movement_type="return_to_supplier",
            reference_type="supplier_return",
            reference_id=supplier_return.id,
            notes=f"Returned to supplier -- {supplier_return.return_number} ({data['reason']})",
            user_id=user_id,
            supplier_id=supplier_return.supplier_id,
        )

    audit_service.log_create(db, TABLE_NAME, supplier_return.id, user_id)
    db.commit()
    return get_supplier_return(db, supplier_return.id)


def delete_supplier_return(db: Session, return_id: int, user_id: int | None = None) -> None:
    """Reverses a wrongly-entered return: puts the quantity back on the
    shelf (movement_type='adjustment', same as any other manual stock
    correction) and soft-deletes the record. There's no edit, same stance
    as Payment -- correcting a mistake means reversing it and recording a
    fresh one, so the ledger never silently rewrites what was entered.
    """
    supplier_return = get_supplier_return(db, return_id)
    for line in supplier_return.lines:
        inventory_service.adjust_stock(
            db,
            item_type="raw_material",
            item_id=line.raw_material_id,
            quantity=float(line.quantity),
            movement_type="adjustment",
            reference_type="supplier_return",
            reference_id=supplier_return.id,
            notes=f"Reversed supplier return {supplier_return.return_number} (entered in error)",
            user_id=user_id,
        )
    supplier_return.deleted_at = datetime.now(timezone.utc)
    supplier_return.updated_by = user_id
    audit_service.log_delete(db, TABLE_NAME, return_id, user_id)
    db.commit()
