from sqlalchemy import Enum, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK

SUPPLIER_MODES_OF_SUPPLY = ("direct", "distributor", "broker", "import")


class Supplier(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payment_terms_days: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=30)
    mode_of_supply: Mapped[str | None] = mapped_column(
        Enum(*SUPPLIER_MODES_OF_SUPPLY, name="supplier_mode_of_supply"), nullable=True
    )
    rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)  # 1-5 stars
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", "suspended", name="supplier_status"),
        nullable=False,
        default="active",
    )
