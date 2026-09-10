from sqlalchemy import DECIMAL, JSON, BigInteger, Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK

RAW_MATERIAL_TYPES = ("raw_material", "packaging", "consumable")


class RawMaterial(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "raw_materials"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    # What kind of material this is -- purely classification, doesn't
    # change how it's stocked/purchased/consumed anywhere downstream.
    material_type: Mapped[str] = mapped_column(
        Enum(*RAW_MATERIAL_TYPES, name="raw_material_type"), nullable=False, default="raw_material"
    )
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Structured spec/attribute key-value pairs (e.g. {"grade": "A",
    # "thickness_mm": "2.5"}) instead of fixed columns per attribute --
    # mirrors app/models/product.py's `properties` field exactly, for the
    # same reason: attributes vary wildly by material and aren't read by
    # any business logic, so a fixed schema would either be incomplete
    # or bloat this table with mostly-NULL columns.
    properties: Mapped[dict[str, str] | None] = mapped_column(JSON, nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(150), nullable=True)
    manufacturer_part_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # -- Stock control -- on-hand/available/reserved themselves stay in
    # raw_material_inventory (see inventory_service); these are just the
    # planning thresholds against that live quantity.
    reorder_point: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    safety_stock: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    maximum_stock: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    storage_location: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Kept for compatibility -- purchase_order_service defaults a new PO
    # line's price from this, and dashboard/report inventory valuation
    # sums quantity_on_hand * unit_cost. Supplier-specific pricing now
    # lives on supplier_materials.purchase_price instead (see that
    # model); this remains the material's own baseline/fallback cost,
    # not a second source of truth for what any one supplier charges.
    default_supplier_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("suppliers.id"), nullable=True
    )
    unit_cost: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)

    # -- Lightweight quality control -- not a QMS: just enough for
    # procurement/receiving to know whether this material needs an
    # inspection or a certificate on receipt, and what "acceptable"
    # means in free text.
    inspection_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    certificate_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    qc_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", "blocked", name="raw_material_status"),
        nullable=False,
        default="active",
    )
