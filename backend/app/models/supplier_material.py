from datetime import date

from sqlalchemy import DECIMAL, Date, ForeignKey, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import BigPK


class SupplierMaterial(Base, TimestampMixin, SoftDeleteMixin):
    """One raw material a supplier can supply, and how much of it.

    Mirrors BomLine's shape/pattern (see models/bom.py): a supplier-side
    line item rather than a single FK, since a supplier commonly supplies
    several different materials, each with its own capacity and lead
    time. Unlike BomLine's component_type/component_id polymorphism,
    this only ever points at raw materials, so a plain FK is enough.
    """

    __tablename__ = "supplier_materials"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    supplier_id: Mapped[int] = mapped_column(BigPK, ForeignKey("suppliers.id"), nullable=False)
    raw_material_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("raw_materials.id"), nullable=False
    )
    max_supply_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    lead_time_days: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Both auto-captured, never user-entered -- see supplier_material_
    # service.py's replace_lines override, which carries these two
    # forward (matched by raw_material_id) across every PUT .../materials
    # call instead of resetting them, since that endpoint otherwise
    # replaces every line wholesale on each save.
    onboarded_at: Mapped[date] = mapped_column(Date, nullable=False)
    # Set by purchase_order_service.receive_lines whenever a receipt
    # against this supplier+material is recorded -- null until then.
    last_transaction_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    raw_material: Mapped[RawMaterial] = relationship(foreign_keys=[raw_material_id], lazy="joined")
    supplier: Mapped[Supplier] = relationship(foreign_keys=[supplier_id], lazy="joined")
