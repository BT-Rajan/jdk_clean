from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, BigInteger, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.timezone import now_kuwait_naive
from app.models.user import BigPK

STOCK_ADJUSTMENT_REQUEST_STATUSES = ("pending", "applied", "rejected")


class FinishedGoodsInventory(Base):
    __tablename__ = "finished_goods_inventory"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id"), unique=True, nullable=False
    )
    quantity_on_hand: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    quantity_reserved: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_kuwait_naive, onupdate=now_kuwait_naive
    )


class RawMaterialInventory(Base):
    __tablename__ = "raw_material_inventory"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    raw_material_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("raw_materials.id"), unique=True, nullable=False
    )
    quantity_on_hand: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    quantity_reserved: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_kuwait_naive, onupdate=now_kuwait_naive
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    item_type: Mapped[str] = mapped_column(
        Enum("raw_material", "product", name="stock_item_type"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    movement_type: Mapped[str] = mapped_column(
        Enum(
            "receipt", "issue", "adjustment", "production_in", "production_out", "return",
            "return_to_supplier", "reserve", "release",
            name="stock_movement_type",
        ),
        nullable=False,
    )
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Required by inventory_service.adjust_stock for every raw_material
    # 'receipt' movement (batch_number/expiry_date excepted) -- see that
    # function's docstring. Nullable at the DB level since they're
    # meaningless for issues/adjustments/production movements.
    supplier_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("suppliers.id"), nullable=True)
    unit_cost: Mapped[float | None] = mapped_column(DECIMAL(14, 4), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    received_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    received_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_kuwait_naive)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)


class StockAdjustmentRequest(Base):
    """A manual stock adjustment whose |quantity| is at/above the
    configurable large-stock-adjustment threshold (settings_service.
    get_large_stock_adjustment_threshold) -- held here in 'pending'
    rather than applied immediately, until an admin approves (which
    applies it, via the exact same inventory_service.adjust_stock every
    other adjustment goes through) or rejects it. Every field mirrors
    adjust_stock's own parameters so approval can replay the request
    verbatim -- see inventory_service.submit_manual_adjustment/
    approve_stock_adjustment_request.
    """

    __tablename__ = "stock_adjustment_requests"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    item_type: Mapped[str] = mapped_column(Enum("raw_material", "product", name="stock_item_type_req"), nullable=False)
    item_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Mandatory -- see inventory_service.submit_manual_adjustment (every
    # manual adjustment requires a reason, not just ones large enough to
    # need approval).
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    supplier_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("suppliers.id"), nullable=True)
    unit_cost: Mapped[float | None] = mapped_column(DECIMAL(14, 4), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    received_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    received_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*STOCK_ADJUSTMENT_REQUEST_STATUSES, name="stock_adjustment_request_status"),
        nullable=False,
        default="pending",
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set once approved-and-applied -- the resulting ledger entry, so a
    # request row and its actual stock movement can always be traced to
    # each other in either direction.
    resulting_movement_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("stock_movements.id"), nullable=True
    )
    requested_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=now_kuwait_naive)
    decided_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
