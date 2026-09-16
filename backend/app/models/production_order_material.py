from sqlalchemy import DECIMAL, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.bom import Bom
from app.models.mixins import TimestampMixin
from app.models.production_order import ProductionOrder
from app.models.raw_material import RawMaterial
from app.models.user import BigPK

MATERIAL_REQUIREMENT_SOURCES = ("bom", "packaging")


class ProductionOrderMaterialRequirement(Base, TimestampMixin):
    """One calculated line of 'how much of this raw material does this
    Production Order need' -- the persistent snapshot P3 introduces (see
    docs/production-lifecycle.md and the P3 implementation report).

    Always resolves to a raw_materials row, from one of two existing
    sources rather than a new calculation engine of its own:
      - 'bom'       -- bom_service.explode_requirements_detailed's own
                       recursive, scrap-inflated, multi-level walk of the
                       product's active BOM (sub-assemblies are already
                       flattened to raw materials by that function, so
                       this table never needs a separate "component_type").
      - 'packaging' -- product_packaging_lines, scaled by planned
                       quantity (quantity_per_unit * planned_quantity,
                       no scrap/output_quantity scaling -- packaging
                       isn't part of the manufacturing formula).

    `bom_id` records which BOM produced a 'bom'-sourced row (NULL for
    'packaging' rows, which aren't tied to a BOM at all) -- the
    traceability the P3 spec asks for, and the reason a later BOM edit
    doesn't retroactively change an already-calculated requirement: this
    row is a snapshot, not a live join.

    `available_quantity`/`shortage_quantity` are deliberately NOT
    columns here -- inventory changes constantly, so those are computed
    live from inventory_service.get_stock at read time (same "computed
    fresh every call" stance mrp_service.compute_requirements already
    takes), never persisted, never a second source of truth alongside
    the real stock ledger. Allocation (a P4 concern) is likewise not a
    column yet -- extending this table with one later is a single
    additive migration, not a redesign.

    (production_order_id, raw_material_id, source) is unique -- a
    recalculation deletes and reinserts this Production Order's rows in
    one transaction (see production_order_material_service.calculate),
    which is what actually guarantees no duplicates; the constraint is
    the last-line-of-defense backstop.
    """

    __tablename__ = "production_order_material_requirements"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    production_order_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("production_orders.id"), nullable=False
    )
    bom_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("boms.id"), nullable=True)
    raw_material_id: Mapped[int] = mapped_column(BigPK, ForeignKey("raw_materials.id"), nullable=False)
    source: Mapped[str] = mapped_column(
        Enum(*MATERIAL_REQUIREMENT_SOURCES, name="production_order_material_source"), nullable=False
    )
    required_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)

    production_order: Mapped[ProductionOrder] = relationship(foreign_keys=[production_order_id], lazy="joined")
    bom: Mapped[Bom | None] = relationship(foreign_keys=[bom_id], lazy="joined")
    raw_material: Mapped[RawMaterial] = relationship(foreign_keys=[raw_material_id], lazy="joined")
