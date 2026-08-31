from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.department import Department

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
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    avatar_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Which document-creating department this user belongs to (staff only
    # get write access to Quotations/Orders/Purchase Orders through this --
    # admin/manager keep full access regardless). NULL means no department,
    # i.e. a staff member with read-only access everywhere, same as before
    # this column existed. References the Department master (People &
    # Organization) instead of a hardcoded ENUM -- see app/models/department.py.
    department_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("departments.id"), nullable=True)
    # foreign_keys is explicit because departments.created_by/updated_by
    # (TimestampMixin) also point back at users.id, giving SQLAlchemy two
    # possible join paths between the two tables otherwise.
    department: Mapped["Department | None"] = relationship(
        "Department", lazy="joined", foreign_keys=[department_id]
    )
    # Which Manager this user (a Member -- staff/viewer) reports to in the
    # org chart (Admin -> Access control -> Org chart). Admin ("Owner") and
    # manager rows leave this NULL: there's exactly one owner tier and one
    # manager tier, both fixed by role, so only Members need a reporting
    # line. No ORM relationship (just the raw id) since the org-chart
    # endpoint builds the tree itself from a flat user list -- see
    # app/api/users.py update_user for the "target must be an active
    # manager" validation enforced on write.
    manager_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    # Admin-assigned signature image (mirrors avatar_filename exactly --
    # same upload/storage pattern, see profile_service.py and
    # signature_service.py). No self-upload, no approval state: admin
    # uploads and assigns directly.
    signature_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(
        Enum("admin", "manager", "staff", "viewer", name="user_role"),
        nullable=False,
        default="staff",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    @property
    def department_code(self) -> str | None:
        """Convenience for the handful of callers (notification_service,
        etc.) that only ever branched on the department's code, not its
        id -- keeps them from needing their own Department lookup."""
        return self.department.code if self.department else None
