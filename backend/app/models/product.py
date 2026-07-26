from sqlalchemy import DECIMAL, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
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
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="product_status"), nullable=False, default="active"
    )
