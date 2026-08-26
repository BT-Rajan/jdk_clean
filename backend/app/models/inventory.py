from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, BigInteger, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.user import BigPK


class FinishedGoodsInventory(Base):
    __tablename__ = "finished_goods_inventory"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id"), unique=True, nullable=False
    )
    quantity_on_hand: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    quantity_reserved: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
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
        DateTime, server_default=func.now(), onupdate=func.now()
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
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
