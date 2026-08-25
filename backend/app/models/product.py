from sqlalchemy import DECIMAL, JSON, Enum, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.machine import Machine
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK


class Product(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    product_type: Mapped[str] = mapped_column(
        Enum("finished_good", "sub_assembly", name="product_type"),
        nullable=False,
        default="finished_good",
    )
    selling_price: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    # How this product's production time is actually specified day to
    # day: as one batch (e.g. "500 units, 6 hours"), not a per-unit
    # number nobody would naturally quote. Both optional; when both are
    # set, production_hours_per_unit below is kept in sync as
    # batch_production_hours / batch_size (see crud.master_data.
    # ProductCRUD) -- everything downstream (feasibility_service,
    # capacity_service, order_service's auto-scheduling) keeps working
    # off the per-unit figure unchanged, this is purely how it's entered.
    batch_size: Mapped[float | None] = mapped_column(DECIMAL(14, 4), nullable=True)
    batch_production_hours: Mapped[float | None] = mapped_column(DECIMAL(10, 4), nullable=True)
    # The "formula" inputs for feasibility's time-required calculation:
    # which machine makes this product, how many hours of that machine's
    # time one unit consumes, and how many workers are needed concurrently
    # for that time. All optional -- products with none of these simply
    # skip the capacity check (only the material/BOM check runs).
    machine_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("machines.id"), nullable=True)
    production_hours_per_unit: Mapped[float | None] = mapped_column(DECIMAL(10, 4), nullable=True)
    workers_required: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="product_status"), nullable=False, default="active"
    )
    # Free-form labels for filtering/grouping in the UI (e.g. "seasonal",
    # "export-grade") -- not used by any business logic, purely a search/
    # organization aid. Stored as a native JSON list; NULL/empty means none.
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # Arbitrary spec/attribute key-value pairs (e.g. {"color": "amber",
    # "shelf_life_days": "180"}) -- like tags, descriptive only and not
    # read by feasibility/BOM/capacity logic. Stored as a native JSON
    # object; NULL/empty means none set.
    properties: Mapped[dict[str, str] | None] = mapped_column(JSON, nullable=True)

    machine: Mapped[Machine | None] = relationship(lazy="joined")
