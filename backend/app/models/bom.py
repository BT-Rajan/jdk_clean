from sqlalchemy import DECIMAL, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.product import Product
from app.models.user import BigPK

BOM_COMPONENT_TYPES = ("raw_material", "product")


class Bom(Base, TimestampMixin, SoftDeleteMixin):
    """The BOM "header" for one product -- at most one per product
    (product_id is unique), separate from the bom_lines it groups.
    Owns only what a BOM itself is responsible for (identity, the batch
    size its line quantities are expressed against, whether it's the
    active recipe, and free-form notes) -- everything about the product
    itself (code, name, type, unit, production info, status,
    specifications) stays on Product; nothing here duplicates it.

    Deliberately one-per-product, not a versioned/revisioned history --
    this app has no ECO/change-control workflow. "Active/inactive" here
    means "is this currently the authoritative recipe", not a draft vs.
    approved distinction.
    """

    __tablename__ = "boms"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    # Auto-generated via number_series (doc_type 'BOM', prefix BOM) --
    # never user-entered, same convention as order_number/po_number/etc.
    bom_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    product_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("products.id"), unique=True, nullable=False
    )
    # The batch size every component line's `quantity` is expressed
    # against -- e.g. output_quantity=100 with a line quantity=20 means
    # "20 of this per 100 units of the product", not per single unit.
    # Requirement scaling (bom_service.explode_requirements) divides by
    # this to get a per-unit figure before multiplying by whatever
    # quantity is actually being produced. Defaults to 1, which makes a
    # line's quantity mean "per unit" directly -- the same interpretation
    # this module used before output_quantity existed, so every BOM
    # backfilled from existing data behaves identically to before.
    output_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="bom_status"), nullable=False, default="active"
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")


class BomLine(Base, TimestampMixin, SoftDeleteMixin):
    """One ingredient/sub-assembly needed to build `parent_product_id`.

    `component_type` + `component_id` is a polymorphic reference (mirrors
    the same pattern StockMovement/inventory_service already use for
    item_type/item_id) rather than two separate FK columns, since a
    component can be either a raw material or another product (multi-level
    BOM / sub-assemblies). Resolving the referenced row is done in
    bom_service, not via an ORM relationship, for the same reason.
    """

    __tablename__ = "bom_lines"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    parent_product_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("products.id"), nullable=False
    )
    component_type: Mapped[str] = mapped_column(
        Enum(*BOM_COMPONENT_TYPES, name="bom_component_type"), nullable=False
    )
    component_id: Mapped[int] = mapped_column(BigPK, nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    scrap_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False, default=0)

    parent_product: Mapped[Product] = relationship(foreign_keys=[parent_product_id], lazy="joined")
