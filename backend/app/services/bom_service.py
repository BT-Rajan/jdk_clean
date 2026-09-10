from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.crud.child_lines import ChildLineCRUD
from app.models.bom import Bom, BomLine
from app.models.inventory import RawMaterialInventory
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.services import audit_service, number_series_service

TABLE_NAME = "bom_lines"
HEADER_TABLE_NAME = "boms"
MAX_BOM_DEPTH = 10  # guards against pathological/unintended deep nesting


def _get_active_product(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    if product is None:
        raise NotFoundError("Product")
    return product


def _validate_component_exists(db: Session, component_type: str, component_id: int) -> None:
    """Every component must be a real, currently-active record in its
    own master -- BOM never gets to define its own notion of a material
    or sub-assembly (see module docstring: Product/RawMaterial stay
    authoritative for everything about themselves). Rejecting an
    inactive/blocked component here, not just a deleted one, is what
    keeps a discontinued material or product from being newly designed
    into a recipe.
    """
    if component_type == "product":
        obj = (
            db.query(Product)
            .filter(Product.id == component_id, Product.deleted_at.is_(None))
            .first()
        )
        if obj is None:
            raise ValidationAppError(f"Component product {component_id} not found.")
        if obj.status != "active":
            raise ValidationAppError(f"Component product {obj.code} is not active.")
    else:
        obj = (
            db.query(RawMaterial)
            .filter(RawMaterial.id == component_id, RawMaterial.deleted_at.is_(None))
            .first()
        )
        if obj is None:
            raise ValidationAppError(f"Component raw material {component_id} not found.")
        if obj.status != "active":
            raise ValidationAppError(f"Component material {obj.code} is not active.")


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


# ============================================================
# BOM header -- see app/models/bom.py's Bom docstring. One per product;
# owns identity/batch-size/active-status/notes only, never master data.
# ============================================================


def get_bom_header(db: Session, product_id: int) -> Bom | None:
    return db.query(Bom).filter(Bom.product_id == product_id, Bom.deleted_at.is_(None)).first()


def component_count(db: Session, product_id: int) -> int:
    return (
        db.query(BomLine)
        .filter(BomLine.parent_product_id == product_id, BomLine.deleted_at.is_(None))
        .count()
    )


def get_or_create_bom_header(db: Session, product_id: int, user_id: int | None = None) -> Bom:
    """Lazily provisions a header for a product that already has (or is
    about to get) bom_lines but was never explicitly walked through
    "create a BOM" -- called from BomLineCRUD's add_line/replace_lines
    overrides below, and by the one-time migration backfill. Defaults to
    status='active' (unlike create_bom_header's deliberate 'inactive'
    start -- see that function), since this path exists specifically to
    keep pre-existing data and any caller that just adds lines directly
    behaving exactly as it did before headers existed: a product with
    lines was always usable by Production/MRP immediately, with no
    separate activation step.
    """
    existing = get_bom_header(db, product_id)
    if existing is not None:
        return existing
    header = Bom(
        bom_number=number_series_service.next_number(db, "BOM"),
        product_id=product_id,
        output_quantity=1,
        status="active",
        created_by=user_id,
    )
    db.add(header)
    db.flush()
    return header


def create_bom_header(db: Session, product_id: int, data: dict, user_id: int | None = None) -> Bom:
    """Explicit "create a BOM for this product" action -- always starts
    'inactive' (a draft being built up) regardless of what's in `data`,
    so a freshly created, still-empty BOM can never be mistaken for the
    authoritative recipe until someone deliberately activates it (see
    update_bom_header, which refuses to activate an empty one).
    """
    product = _get_active_product(db, product_id)
    if product.status != "active":
        raise ValidationAppError(f"Product {product.code} must be active to create a BOM for it.")
    if get_bom_header(db, product_id) is not None:
        raise ConflictError(f"{product.code} already has a BOM. Edit the existing one instead.")

    header = Bom(
        bom_number=number_series_service.next_number(db, "BOM"),
        product_id=product_id,
        output_quantity=data.get("output_quantity", 1),
        status="inactive",
        notes=data.get("notes"),
        created_by=user_id,
    )
    db.add(header)
    db.flush()
    audit_service.log_create(db, HEADER_TABLE_NAME, header.id, user_id)
    db.commit()
    db.refresh(header)
    return header


def update_bom_header(db: Session, product_id: int, data: dict, user_id: int | None = None) -> Bom:
    header = get_bom_header(db, product_id)
    if header is None:
        raise NotFoundError("BOM")

    if data.get("status") == "active" and header.status != "active":
        product = _get_active_product(db, product_id)
        if product.status != "active":
            raise ValidationAppError(f"Product {product.code} must be active to activate its BOM.")
        if component_count(db, product_id) == 0:
            raise ValidationAppError("Cannot activate an empty BOM -- add at least one component first.")

    changes: dict[str, tuple] = {}
    for field, new_value in data.items():
        old_value = getattr(header, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(header, field, new_value)
    header.updated_by = user_id
    audit_service.log_update(db, HEADER_TABLE_NAME, header.id, changes, user_id)
    db.commit()
    db.refresh(header)
    return header


# ============================================================
# BOM lines
# ============================================================


class BomLineCRUD(ChildLineCRUD[BomLine]):
    model = BomLine
    table_name = TABLE_NAME
    parent_field = "parent_product_id"
    parent_model = Product
    parent_label = "Product"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        _validate_component_exists(db, line["component_type"], line["component_id"])
        _assert_no_cycle(db, parent_id, line["component_type"], line["component_id"])

    def _duplicate_filter(self, parent_id: int, line: dict) -> list:
        return [
            BomLine.component_type == line["component_type"],
            BomLine.component_id == line["component_id"],
        ]

    def replace_lines(
        self, db: Session, parent_id: int, lines: list[dict], user_id: int | None = None
    ) -> list[BomLine]:
        get_or_create_bom_header(db, parent_id, user_id=user_id)
        return super().replace_lines(db, parent_id, lines, user_id=user_id)

    def add_line(self, db: Session, parent_id: int, line: dict, user_id: int | None = None) -> BomLine:
        get_or_create_bom_header(db, parent_id, user_id=user_id)
        return super().add_line(db, parent_id, line, user_id=user_id)

    def _resolve_labels(self, db: Session, lines: list[BomLine]) -> None:
        """Attaches component_code/component_name (BomLine has no ORM
        relationship to its component since it's polymorphic -- see the
        model docstring), plus display-only fields the BOM table and
        Production/MRP shouldn't each have to recompute: the raw
        material's own material_type classification, its live on-hand
        stock, and the scrap-inflated effective_quantity for this line.
        """
        product_ids = {l.component_id for l in lines if l.component_type == "product"}
        material_ids = {l.component_id for l in lines if l.component_type == "raw_material"}

        products = {
            p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
        } if product_ids else {}
        materials = {
            m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(material_ids)).all()
        } if material_ids else {}
        stock_by_material = {
            row.raw_material_id: float(row.quantity_on_hand)
            for row in db.query(RawMaterialInventory).filter(
                RawMaterialInventory.raw_material_id.in_(material_ids)
            ).all()
        } if material_ids else {}

        for line in lines:
            source = products.get(line.component_id) if line.component_type == "product" else materials.get(line.component_id)
            line.component_code = source.code if source else None
            line.component_name = source.name if source else None
            line.component_material_type = (
                materials[line.component_id].material_type if line.component_id in materials else None
            )
            line.component_on_hand = (
                stock_by_material.get(line.component_id, 0.0) if line.component_type == "raw_material" else None
            )
            line.effective_quantity = float(line.quantity) * (1 + float(line.scrap_percent) / 100)


bom_line_crud = BomLineCRUD()


def get_bom(db: Session, parent_product_id: int) -> list[BomLine]:
    return bom_line_crud.get_lines(db, parent_product_id)


def replace_bom(db: Session, parent_product_id: int, lines: list[dict], user_id: int | None = None) -> list[BomLine]:
    return bom_line_crud.replace_lines(db, parent_product_id, lines, user_id=user_id)


def add_bom_line(db: Session, parent_product_id: int, line: dict, user_id: int | None = None) -> BomLine:
    return bom_line_crud.add_line(db, parent_product_id, line, user_id=user_id)


def delete_bom_line(db: Session, parent_product_id: int, line_id: int, user_id: int | None = None) -> None:
    bom_line_crud.delete_line(db, parent_product_id, line_id, user_id=user_id)


def has_bom(db: Session, product_id: int) -> bool:
    """Whether `product_id` currently has a usable BOM: an active header
    with at least one line. Distinct from explode_requirements()
    returning an empty dict, which can also happen for a genuinely
    BOM-less (or deliberately deactivated) product and would otherwise
    look identical to 'nothing required, all good' when it's really
    'nobody's set up this product's formula yet' (or it's been turned
    off). Used by feasibility_service/production_service to tell those
    cases apart rather than silently reporting feasible. An inactive BOM
    counts the same as no BOM here -- Production must use the *active*
    BOM as the authoritative recipe, never a deactivated one.
    """
    header = get_bom_header(db, product_id)
    if header is None or header.status != "active":
        return False
    return (
        db.query(BomLine)
        .filter(BomLine.parent_product_id == product_id, BomLine.deleted_at.is_(None))
        .first()
        is not None
    )


def _active_bom_for_product(db: Session, product_id: int) -> Bom | None:
    header = get_bom_header(db, product_id)
    return header if header is not None and header.status == "active" else None


def explode_requirements(db: Session, product_id: int, quantity: float) -> dict[int, float]:
    """Recursively walks the (possibly multi-level) BOM for `product_id` and
    returns total raw-material requirements for producing `quantity` units,
    as {raw_material_id: quantity_required}, applying each level's
    scrap_percent along the way.

    Sub-assemblies (component_type == 'product') are expanded rather than
    treated as leaves; only raw materials accumulate in the result. Only
    a product's *active* BOM contributes -- a product with no BOM, or one
    that's been deactivated, contributes nothing from that point down
    (same as always having had zero lines).

    A BOM line's quantity is expressed per the header's output_quantity
    (see app/models/bom.py's Bom.output_quantity) -- e.g. a line quantity
    of 20 against output_quantity=100 means 20 per 100 units produced.
    Every level's multiplier is divided by that level's own
    output_quantity before being applied, so a multi-level BOM scales
    correctly at each level independently. output_quantity defaults to
    1, which makes this identical to the pre-existing "quantity is
    per-unit" behavior for every BOM that predates this field.

    A BOM line's unit is assumed to already be expressed in the raw
    material's own unit -- there's no unit conversion here (the BOM
    editor auto-derives a line's unit from its component's own `unit`
    and doesn't let it be changed, see BomEditor.tsx's defaultUnitFor),
    so summing line.quantity directly is safe. If a BOM line's unit ever
    genuinely differs from its material's unit (e.g. old data), this
    silently sums the raw numbers rather than converting -- there is no
    unit master to convert against anymore.
    """
    _get_active_product(db, product_id)
    totals: dict[int, float] = {}

    def _walk(current_product_id: int, multiplier: float, depth: int) -> None:
        if depth > MAX_BOM_DEPTH:
            raise ConflictError(
                f"BOM nesting exceeds the maximum supported depth ({MAX_BOM_DEPTH})."
            )
        bom = _active_bom_for_product(db, current_product_id)
        if bom is None:
            return
        lines = (
            db.query(BomLine)
            .filter(BomLine.parent_product_id == current_product_id, BomLine.deleted_at.is_(None))
            .all()
        )
        scale = multiplier / float(bom.output_quantity)
        for line in lines:
            # scrap_percent% extra is consumed beyond the "net" quantity
            effective_qty = float(line.quantity) * (1 + float(line.scrap_percent) / 100) * scale
            if line.component_type == "raw_material":
                totals[line.component_id] = totals.get(line.component_id, 0.0) + effective_qty
            else:
                _walk(line.component_id, effective_qty, depth + 1)

    _walk(product_id, float(quantity), depth=1)
    return totals


def explode_requirements_detailed(db: Session, product_id: int, quantity: float) -> dict[int, dict[str, float]]:
    """Same recursive walk as explode_requirements, but also returns each
    raw material's *net* (zero-scrap) requirement alongside its
    scrap-inflated one -- {raw_material_id: {"net_required":,
    "scrap_inflated_required":}}. The gap between the two, as a
    percentage of net, is the admin-configured scrap allowance for
    however this material's own contributing BOM line(s) are set up
    (used by production_service to check actual usage against it at
    batch completion -- see _complete_batch).

    Kept as a separate function rather than changing explode_requirements
    itself so every existing caller (feasibility's shortfall check,
    _reserve_batch_materials, mrp_service) keeps getting the flat,
    scrap-inflated-only totals it already expects. See explode_requirements
    for the output_quantity scaling and active-BOM-only rules -- identical
    here.
    """
    _get_active_product(db, product_id)
    totals: dict[int, dict[str, float]] = {}

    def _walk(current_product_id: int, multiplier: float, depth: int) -> None:
        if depth > MAX_BOM_DEPTH:
            raise ConflictError(
                f"BOM nesting exceeds the maximum supported depth ({MAX_BOM_DEPTH})."
            )
        bom = _active_bom_for_product(db, current_product_id)
        if bom is None:
            return
        lines = (
            db.query(BomLine)
            .filter(BomLine.parent_product_id == current_product_id, BomLine.deleted_at.is_(None))
            .all()
        )
        scale = multiplier / float(bom.output_quantity)
        for line in lines:
            net_qty = float(line.quantity) * scale
            scrap_inflated_qty = net_qty * (1 + float(line.scrap_percent) / 100)
            if line.component_type == "raw_material":
                entry = totals.setdefault(line.component_id, {"net_required": 0.0, "scrap_inflated_required": 0.0})
                entry["net_required"] += net_qty
                entry["scrap_inflated_required"] += scrap_inflated_qty
            else:
                _walk(line.component_id, scrap_inflated_qty, depth + 1)

    _walk(product_id, float(quantity), depth=1)
    return totals
