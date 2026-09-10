from datetime import date

from sqlalchemy import DECIMAL, Boolean, Date, Enum, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import BigPK


class SupplierMaterial(Base, TimestampMixin, SoftDeleteMixin):
    """One raw material a supplier can supply, and on what terms.

    Mirrors BomLine's shape/pattern (see models/bom.py): a supplier-side
    line item rather than a single FK, since a supplier commonly supplies
    several different materials, each with its own price, capacity and
    lead time. Unlike BomLine's component_type/component_id polymorphism,
    this only ever points at raw materials, so a plain FK is enough.

    This is the one place supplier-specific purchase price lives --
    raw_materials.unit_cost is a material-level fallback/valuation
    figure, never a substitute for what a *specific* supplier actually
    charges (see that column's docstring).
    """

    __tablename__ = "supplier_materials"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    supplier_id: Mapped[int] = mapped_column(BigPK, ForeignKey("suppliers.id"), nullable=False)
    raw_material_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("raw_materials.id"), nullable=False
    )
    supplier_material_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    purchase_price: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KWD")
    lead_time_days: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    moq: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    max_supply_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    # Whether this is the go-to supplier for this material -- at most one
    # active row per raw_material_id may carry this (enforced in
    # supplier_material_service, not the DB). Distinct from
    # raw_materials.default_supplier_id, which predates this table's
    # existence and is kept only for compatibility (see that column).
    is_preferred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Whether this relationship is currently usable -- e.g. a supplier
    # temporarily can't fulfil this material without severing the
    # relationship entirely (soft delete). Independent of deleted_at.
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="supplier_material_status"), nullable=False, default="active"
    )
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
