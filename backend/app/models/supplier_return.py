from datetime import date

from sqlalchemy import DATE, DECIMAL, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import BigPK, User


class SupplierReturn(Base, TimestampMixin, SoftDeleteMixin):
    """Raw material sent back to a supplier -- almost always a quality
    rejection (contaminated, off-spec, damaged in transit) found after
    receiving. Recording one immediately deducts the returned quantity
    from raw-material stock on hand (see supplier_return_service.
    create_supplier_return), the same way issuing a delivery note
    immediately deducts finished-goods stock -- a real, already-decided
    action, not a draft someone edits over time. There's no status
    workflow because of that: it's created once, done. Soft-deletable
    rather than editable, same stance as Payment -- correcting a
    wrongly-entered return means reversing it (which puts the stock back)
    and recording a fresh one, so the ledger never silently rewrites what
    actually happened.
    """

    __tablename__ = "supplier_returns"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    return_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    supplier_id: Mapped[int] = mapped_column(BigPK, ForeignKey("suppliers.id"), nullable=False)
    # Optional -- the return is often traceable to a specific delivery,
    # but not always (e.g. a defect only noticed once several deliveries'
    # worth had already been mixed into the same bin).
    purchase_order_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("purchase_orders.id"), nullable=True)
    return_date: Mapped[date] = mapped_column(DATE, nullable=False)
    # Mandatory -- same "why" requirement as every other cancel/close
    # reason in this app, since this is itself a one-shot closing action.
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    supplier: Mapped[Supplier] = relationship(lazy="joined")
    purchase_order = relationship("PurchaseOrder", lazy="joined")
    creator: Mapped[User | None] = relationship(foreign_keys="SupplierReturn.created_by", lazy="joined")
    lines: Mapped[list["SupplierReturnLine"]] = relationship(
        back_populates="supplier_return",
        cascade="all, delete-orphan",
        order_by="SupplierReturnLine.id",
    )


class SupplierReturnLine(Base):
    __tablename__ = "supplier_return_lines"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    supplier_return_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("supplier_returns.id", ondelete="CASCADE"), nullable=False
    )
    raw_material_id: Mapped[int] = mapped_column(BigPK, ForeignKey("raw_materials.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)

    supplier_return: Mapped[SupplierReturn] = relationship(back_populates="lines")
    raw_material: Mapped[RawMaterial] = relationship(lazy="joined")
