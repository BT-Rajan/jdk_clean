from sqlalchemy import BigInteger, Boolean, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin

# BigInteger with an Integer variant for SQLite: MySQL (production) gets a real
# BIGINT AUTO_INCREMENT; SQLite (used only for local/dev smoke tests) gets its
# native INTEGER PRIMARY KEY rowid-alias so autoincrement works there too.
BigPK = BigInteger().with_variant(Integer, "sqlite")


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("admin", "manager", "staff", "viewer", name="user_role"),
        nullable=False,
        default="staff",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
