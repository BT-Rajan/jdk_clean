from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models.bom import BomLine
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.services import audit_service

TABLE_NAME = "bom_lines"
MAX_BOM_DEPTH = 10  # guards against pathological/unintended deep nesting


def _get_active_product(db: Session, product_id: int) -> Product:
    product = (
        db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    )
    if product is None:
        raise NotFoundError("Product")
    return product


def _validate_component_exists(db: Session, component_type: str, component_id: int) -> None:
    if component_type == "product":
        obj = (
            db.query(Product)
            .filter(Product.id == component_id, Product.deleted_at.is_(None))
            .first()
        )
        if obj is None:
            raise ValidationAppError(f"Component product {component_id} not found.")
    else:
        obj = (
            db.query(RawMaterial)
            .filter(RawMaterial.id == component_id, RawMaterial.deleted_at.is_(None))
            .first()
        )
        if obj is None:
            raise ValidationAppError(f"Component raw material {component_id} not found.")


def _reachable_product_ids(db: Session, start_product_id: int) -> set[int]:
    """All product IDs reachable by walking down `start_product_id`'s BOM
    (i.e. its sub-assemblies, their sub-assemblies, etc). Used to detect
    cycles before they're written: adding component `c` under parent `p` is
    only safe if `p` is not reachable from `c`.
    """
    visited: set[int] = set()
    frontier = [start_product_id]
    depth = 0
    while frontier:
        depth += 1
        if depth > MAX_BOM_DEPTH:
            raise ConflictError(
                f"BOM nesting exceeds the maximum supported depth ({MAX_BOM_DEPTH})."
            )
        next_frontier: list[int] = []
        rows = (
            db.query(BomLine)
            .filter(
                BomLine.parent_product_id.in_(frontier),
                BomLine.component_type == "product",
                BomLine.deleted_at.is_(None),
            )
            .all()
        )
        for row in rows:
            if row.component_id not in visited:
                visited.add(row.component_id)
                next_frontier.append(row.component_id)
        frontier = next_frontier
    return visited


def _assert_no_cycle(db: Session, parent_product_id: int, component_type: str, component_id: int) -> None:
    if component_type != "product":
        return
    if component_id == parent_product_id:
        raise ConflictError("A product cannot be a component of its own BOM.")
    reachable_from_component = _reachable_product_ids(db, component_id)
    if parent_product_id in reachable_from_component:
        raise ConflictError(
            f"Adding product {component_id} here would create a circular BOM "
            f"(product {component_id} already (transitively) requires product {parent_product_id})."
        )


def _resolve_component_labels(db: Session, lines: list[BomLine]) -> None:
    """Attaches component_code/component_name as dynamic attributes for the
    response schema (BomLine has no ORM relationship to its component since
    it's polymorphic -- see the model docstring)."""
    product_ids = {l.component_id for l in lines if l.component_type == "product"}
    material_ids = {l.component_id for l in lines if l.component_type == "raw_material"}

    products = {
        p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}
    materials = {
        m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(material_ids)).all()
    } if material_ids else {}

    for line in lines:
        source = products.get(line.component_id) if line.component_type == "product" else materials.get(line.component_id)
        line.component_code = source.code if source else None
        line.component_name = source.name if source else None


def get_bom(db: Session, parent_product_id: int) -> list[BomLine]:
    _get_active_product(db, parent_product_id)
    lines = (
        db.query(BomLine)
        .filter(BomLine.parent_product_id == parent_product_id, BomLine.deleted_at.is_(None))
        .order_by(BomLine.id)
        .all()
    )
    _resolve_component_labels(db, lines)
    return lines


def replace_bom(db: Session, parent_product_id: int, lines: list[dict], user_id: int | None = None) -> list[BomLine]:
    """Replaces the entire active BOM for a product with the given lines."""
    _get_active_product(db, parent_product_id)

    for line in lines:
        _validate_component_exists(db, line["component_type"], line["component_id"])
        _assert_no_cycle(db, parent_product_id, line["component_type"], line["component_id"])

    existing = (
        db.query(BomLine)
        .filter(BomLine.parent_product_id == parent_product_id, BomLine.deleted_at.is_(None))
        .all()
    )
    now = datetime.now(timezone.utc)
    for row in existing:
        row.deleted_at = now

    new_rows = [
        BomLine(parent_product_id=parent_product_id, created_by=user_id, **line) for line in lines
    ]
    db.add_all(new_rows)
    db.flush()
    audit_service.log_update(
        db,
        TABLE_NAME,
        parent_product_id,
        {"lines": (f"{len(existing)} line(s)", f"{len(new_rows)} line(s)")},
        user_id,
    )
    db.commit()
    return get_bom(db, parent_product_id)


def add_bom_line(db: Session, parent_product_id: int, line: dict, user_id: int | None = None) -> BomLine:
    _get_active_product(db, parent_product_id)
    _validate_component_exists(db, line["component_type"], line["component_id"])
    _assert_no_cycle(db, parent_product_id, line["component_type"], line["component_id"])

    duplicate = (
        db.query(BomLine)
        .filter(
            BomLine.parent_product_id == parent_product_id,
            BomLine.component_type == line["component_type"],
            BomLine.component_id == line["component_id"],
            BomLine.deleted_at.is_(None),
        )
        .first()
    )
    if duplicate is not None:
        raise ConflictError("This component is already on the BOM; edit that line instead.")

    row = BomLine(parent_product_id=parent_product_id, created_by=user_id, **line)
    db.add(row)
    db.flush()
    # Keyed by parent_product_id (not row.id) so this shows up in the
    # product's BOM history alongside replace_bom's entries -- history is
    # queried per-product, not per-line.
    audit_service.log_create(db, TABLE_NAME, parent_product_id, user_id)
    db.commit()
    _resolve_component_labels(db, [row])
    return row


def delete_bom_line(db: Session, parent_product_id: int, line_id: int, user_id: int | None = None) -> None:
    row = (
        db.query(BomLine)
        .filter(BomLine.id == line_id, BomLine.parent_product_id == parent_product_id, BomLine.deleted_at.is_(None))
        .first()
    )
    if row is None:
        raise NotFoundError("BOM line")
    row.deleted_at = datetime.now(timezone.utc)
    # Keyed by parent_product_id, matching add_bom_line/replace_bom -- see
    # note above.
    audit_service.log_delete(db, TABLE_NAME, parent_product_id, user_id)
    db.commit()


def has_bom(db: Session, product_id: int) -> bool:
    """Whether `product_id` has any BOM lines defined at all -- distinct
    from explode_requirements() returning an empty dict, which can also
    happen for a genuinely BOM-less product and would otherwise look
    identical to 'nothing required, all good' when it's really 'nobody's
    set up this product's formula yet'. Used by feasibility_service to
    tell those two cases apart rather than silently reporting feasible.
    """
    return (
        db.query(BomLine)
        .filter(BomLine.parent_product_id == product_id, BomLine.deleted_at.is_(None))
        .first()
        is not None
    )


def explode_requirements(db: Session, product_id: int, quantity: float) -> dict[int, float]:
    """Recursively walks the (possibly multi-level) BOM for `product_id` and
    returns total raw-material requirements for producing `quantity` units,
    as {raw_material_id: quantity_required}, applying each level's
    scrap_percent along the way.

    Sub-assemblies (component_type == 'product') are expanded rather than
    treated as leaves; only raw materials accumulate in the result.
    """
    _get_active_product(db, product_id)
    totals: dict[int, float] = {}

    def _walk(current_product_id: int, multiplier: float, depth: int) -> None:
        if depth > MAX_BOM_DEPTH:
            raise ConflictError(
                f"BOM nesting exceeds the maximum supported depth ({MAX_BOM_DEPTH})."
            )
        lines = (
            db.query(BomLine)
            .filter(BomLine.parent_product_id == current_product_id, BomLine.deleted_at.is_(None))
            .all()
        )
        for line in lines:
            # scrap_percent% extra is consumed beyond the "net" quantity
            effective_qty = float(line.quantity) * (1 + float(line.scrap_percent) / 100) * multiplier
            if line.component_type == "raw_material":
                totals[line.component_id] = totals.get(line.component_id, 0.0) + effective_qty
            else:
                _walk(line.component_id, effective_qty, depth + 1)

    _walk(product_id, float(quantity), depth=1)
    return totals
