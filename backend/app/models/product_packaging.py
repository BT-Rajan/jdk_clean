from sqlalchemy import DECIMAL, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.user import BigPK


class ProductPackagingLine(Base, TimestampMixin, SoftDeleteMixin):
    """One packaging material a finished product needs when it ships --
    e.g. a box, a label, a pallet wrap. Deliberately separate from
    BomLine/bom_lines: a packaging material is never *produced into* the
    product (it isn't part of the manufacturing formula BomLine and
    bom_service.explode_requirements exist for), it's procured and
    stocked just like a raw material (hence the FK to raw_materials
    rather than a new table), and it's consumed when the product goes
    out the door, not during production. Nothing in this codebase
    currently deducts packaging stock automatically (delivery_note_
    service doesn't touch it) -- this table is the admin-facing "what
    packaging does this product need" definition or a report to walk
    from that, not a wired-up automatic stock deduction.

    Always references raw_materials (unlike BomLine, this is never
    polymorphic/product-to-product) since packaging is never itself a
    manufactured sub-assembly.
    """

    __tablename__ = "product_packaging_lines"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    packaging_material_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("raw_materials.id"), nullable=False
    )
    quantity_per_unit: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)

    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")
    packaging_material: Mapped[RawMaterial] = relationship(foreign_keys=[packaging_material_id], lazy="joined")
