from sqlalchemy import DECIMAL, BigInteger, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK


class RawMaterial(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "raw_materials"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    reorder_point: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    default_supplier_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("suppliers.id"), nullable=True
    )
    unit_cost: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="raw_material_status"), nullable=False, default="active"
    )
