from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.crud.child_lines import ChildLineCRUD
from app.models.bom import BomLine
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.unit_of_measure import UnitOfMeasure


def _get_active_product(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    if product is None:
        raise NotFoundError("Product")
    return product

TABLE_NAME = "bom_lines"
MAX_BOM_DEPTH = 10  # guards against pathological/unintended deep nesting


def _active_units_by_code(db: Session) -> dict[str, UnitOfMeasure]:
    rows = db.query(UnitOfMeasure).filter(UnitOfMeasure.status == "active", UnitOfMeasure.deleted_at.is_(None)).all()
    return {u.code: u for u in rows}


def _validate_unit(db: Session, units_by_code: dict[str, UnitOfMeasure], component_type: str, component_id: int, unit: str) -> None:
    """A BOM line's unit must be a recognized code from units_of_measure
    (this is what makes the frontend's unit field an actual dropdown
    rather than free text), and -- when the component is a raw material
    whose own `unit` is also a recognized code -- must be in the same
    category as that material's unit. Without this second check someone
    could save a line in 'ton' against a material tracked in 'pcs' and
    every downstream feasibility/MRP number for it would be silently
    wrong; see explode_requirements for where the resulting (validated)
    units get converted.
    """
    if unit not in units_by_code:
        raise ValidationAppError(
            f"'{unit}' is not a recognized unit. Add it under Master Data -> Materials -> Units of measure first, "
            "or pick an existing one."
        )
    if component_type != "raw_material":
        return
    material = db.query(RawMaterial).filter(RawMaterial.id == component_id, RawMaterial.deleted_at.is_(None)).first()
    if material is None or material.unit not in units_by_code:
        return  # material's own unit predates this table -- nothing to check against
    line_category = units_by_code[unit].category
    material_category = units_by_code[material.unit].category
    if line_category != material_category:
        raise ValidationAppError(
            f"Unit mismatch: this line is in '{unit}' ({line_category}) but {material.name} is tracked "
            f"in '{material.unit}' ({material_category}). Pick a compatible unit so quantities convert correctly."
        )


def _convert_quantity(units_by_code: dict[str, UnitOfMeasure], quantity: float, from_unit: str, to_unit: str) -> float:
    """Converts `quantity` expressed in from_unit into to_unit via each
    unit's factor_to_base (same category only). Falls back to returning
    quantity unchanged -- today's pre-conversion behavior -- when either
    unit is unrecognized or they're in different categories; that
    fallback only covers legacy data written before _validate_unit
    existed, since a fresh save can no longer produce a mismatch.
    """
    if from_unit == to_unit:
        return quantity
    from_uom = units_by_code.get(from_unit)
    to_uom = units_by_code.get(to_unit)
    if from_uom is None or to_uom is None or from_uom.category != to_uom.category:
        return quantity
    return quantity * (float(from_uom.factor_to_base) / float(to_uom.factor_to_base))


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


class BomLineCRUD(ChildLineCRUD[BomLine]):
    model = BomLine
    table_name = TABLE_NAME
    parent_field = "parent_product_id"
    parent_model = Product
    parent_label = "Product"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        _validate_component_exists(db, line["component_type"], line["component_id"])
        _assert_no_cycle(db, parent_id, line["component_type"], line["component_id"])
        _validate_unit(db, _active_units_by_code(db), line["component_type"], line["component_id"], line["unit"])

    def _duplicate_filter(self, parent_id: int, line: dict) -> list:
        return [
            BomLine.component_type == line["component_type"],
            BomLine.component_id == line["component_id"],
        ]

    def _resolve_labels(self, db: Session, lines: list[BomLine]) -> None:
        """Attaches component_code/component_name as dynamic attributes for
        the response schema (BomLine has no ORM relationship to its
        component since it's polymorphic -- see the model docstring)."""
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

    Each BOM line's quantity is converted from the unit it was entered in
    to the raw material's own unit (via units_of_measure) before being
    added to the running total -- two lines for the same material from
    different points in the tree can legitimately be in different units
    (one sub-assembly's line in 'bag', another's in 'kg'), so conversion
    has to happen per line, not once after summing. This is the fix that
    makes feasibility/MRP numbers trustworthy when a BOM mixes units;
    previously this function summed raw line.quantity values regardless
    of unit.
    """
    _get_active_product(db, product_id)
    totals: dict[int, float] = {}
    units_by_code = _active_units_by_code(db)
    material_unit_cache: dict[int, str | None] = {}

    def _material_unit(material_id: int) -> str | None:
        if material_id not in material_unit_cache:
            material = db.query(RawMaterial).filter(RawMaterial.id == material_id).first()
            material_unit_cache[material_id] = material.unit if material else None
        return material_unit_cache[material_id]

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
                material_unit = _material_unit(line.component_id)
                converted_qty = (
                    _convert_quantity(units_by_code, effective_qty, line.unit, material_unit)
                    if material_unit
                    else effective_qty
                )
                totals[line.component_id] = totals.get(line.component_id, 0.0) + converted_qty
            else:
                _walk(line.component_id, effective_qty, depth + 1)

    _walk(product_id, float(quantity), depth=1)
    return totals
