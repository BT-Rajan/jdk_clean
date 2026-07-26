from sqlalchemy import DECIMAL, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.product import Product
from app.models.user import BigPK

BOM_COMPONENT_TYPES = ("raw_material", "product")


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
