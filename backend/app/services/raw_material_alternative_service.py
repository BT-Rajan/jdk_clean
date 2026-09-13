from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationAppError
from app.crud.child_lines import ChildLineCRUD
from app.models.raw_material import RawMaterial
from app.models.raw_material_alternative import RawMaterialAlternative
from app.services import inventory_service

TABLE_NAME = "raw_material_alternatives"


class RawMaterialAlternativeCRUD(ChildLineCRUD[RawMaterialAlternative]):
    model = RawMaterialAlternative
    table_name = TABLE_NAME
    parent_field = "raw_material_id"
    parent_model = RawMaterial
    parent_label = "Raw material"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        alternative_id = line["alternative_material_id"]
        if alternative_id == parent_id:
            raise ConflictError("A raw material cannot be its own approved alternative.")
        alternative = (
            db.query(RawMaterial)
            .filter(RawMaterial.id == alternative_id, RawMaterial.deleted_at.is_(None))
            .first()
        )
        if alternative is None:
            raise ValidationAppError(f"Raw material {alternative_id} not found.")

    def _duplicate_filter(self, parent_id: int, line: dict) -> list:
        return [RawMaterialAlternative.alternative_material_id == line["alternative_material_id"]]


raw_material_alternative_crud = RawMaterialAlternativeCRUD()


def get_alternatives(db: Session, raw_material_id: int) -> list[RawMaterialAlternative]:
    return raw_material_alternative_crud.get_lines(db, raw_material_id)


def add_alternative(
    db: Session, raw_material_id: int, line: dict, user_id: int | None = None
) -> RawMaterialAlternative:
    return raw_material_alternative_crud.add_line(db, raw_material_id, line, user_id=user_id)


def update_alternative(
    db: Session, raw_material_id: int, alternative_id: int, data: dict, user_id: int | None = None
) -> RawMaterialAlternative:
    return raw_material_alternative_crud.update_line(db, raw_material_id, alternative_id, data, user_id=user_id)


def remove_alternative(
    db: Session, raw_material_id: int, alternative_id: int, user_id: int | None = None
) -> None:
    raw_material_alternative_crud.delete_line(db, raw_material_id, alternative_id, user_id=user_id)


def get_approved_alternatives_with_stock(db: Session, raw_material_id: int) -> list[dict]:
    """Approved, active alternatives for `raw_material_id`, sorted by
    priority (the existing deterministic-ordering field on
    RawMaterialAlternative), each with current stock info. This is the
    single source of "what can substitute for this material right now" --
    shared by production_readiness_service (the batch-start check) and
    feasibility_service (the sales-side check), so the two can never
    disagree about which alternatives exist or how much of them is
    available. A blocked/rejected alternative, or one pointing at a
    material that's since been deactivated, never shows up here.
    """
    alternatives = [
        a for a in get_alternatives(db, raw_material_id) if a.status == "approved"
    ]
    alternatives.sort(key=lambda a: a.priority)
    results = []
    for alt in alternatives:
        material = alt.alternative_material
        if material is None or material.status != "active":
            continue
        stock = inventory_service.get_stock(db, "raw_material", alt.alternative_material_id)
        results.append(
            {
                "raw_material_id": alt.alternative_material_id,
                "code": material.code,
                "name": material.name,
                "unit": material.unit,
                "conversion_ratio": float(alt.conversion_ratio),
                "priority": alt.priority,
                "status": alt.status,
                "on_hand": stock["quantity_on_hand"],
                "available": stock["quantity_available"],
            }
        )
    return results


def allocate_alternative_coverage(
    alternatives_with_stock: list[dict], shortfall: float
) -> tuple[list[dict], float]:
    """Greedily covers `shortfall` units of a *primary* material's own
    unit, using approved alternatives in their existing priority order
    (lowest priority number first, same ordering
    get_approved_alternatives_with_stock already returns them in) --
    same greedy, priority/rank-ordered allocation shape mrp_service.
    _suggest_purchases already uses for supplier lead time, just applied
    to on-hand alternative stock instead of purchasing.

    This is read-only: it never touches inventory, never reserves
    anything, and never mutates a BOM. It only answers "if we needed to,
    could these approved alternatives cover this shortfall, and by how
    much" for feasibility to report -- any actual substitution still
    happens exactly where it already did, as an explicit, recorded
    choice at production time (see production_service._complete_batch).

    Each alternative's `available` stock is converted into primary-
    material-equivalent units via its own conversion_ratio (how many
    alternative units it takes to replace one primary unit) before being
    applied against the shortfall, so a 1.5:1 alternative genuinely
    covers less of the shortfall per unit on hand than a 1:1 one would.

    Returns (allocations, remaining_shortfall): allocations is one entry
    per alternative actually drawn on (each alternative's own fields
    plus quantity_used/quantity_covered), in the order they were used;
    remaining_shortfall is what's left uncovered after every available
    alternative has been applied (0 if fully covered).
    """
    remaining = round(max(0.0, shortfall), 4)
    allocations: list[dict] = []
    for alt in alternatives_with_stock:
        if remaining <= 0:
            break
        ratio = float(alt.get("conversion_ratio") or 1.0)
        if ratio <= 0:
            # Not a meaningful conversion -- nothing this alternative's
            # stock could cover.
            continue
        coverable = min(remaining, float(alt["available"]) / ratio)
        coverable = round(coverable, 4)
        if coverable <= 0:
            continue
        allocations.append(
            {
                **alt,
                "quantity_covered": coverable,
                "quantity_used": round(coverable * ratio, 4),
            }
        )
        remaining = round(remaining - coverable, 4)
    return allocations, max(0.0, remaining)
