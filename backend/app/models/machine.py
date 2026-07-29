from sqlalchemy import DECIMAL, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK


class Machine(Base, TimestampMixin, SoftDeleteMixin):
    """A piece of production equipment. Used by the feasibility check's
    machine-availability + time-required calculation: a product names the
    machine that makes it (products.machine_id) and how many hours of that
    machine's time one unit takes (products.production_hours_per_unit);
    booked machine time is read from production_schedules.machine_id.
    """

    __tablename__ = "machines"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    capacity_hours_per_day: Mapped[float] = mapped_column(DECIMAL(6, 2), nullable=False, default=8)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="machine_status"), nullable=False, default="active"
    )
