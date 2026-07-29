from sqlalchemy import DECIMAL, Enum, ForeignKey, SmallInteger, String
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

    machine: Mapped[Machine | None] = relationship(lazy="joined")
