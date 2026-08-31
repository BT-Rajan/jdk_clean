from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK


class Department(Base, TimestampMixin, SoftDeleteMixin):
    """MDM master for organizational departments -- People & Organization
    group. Referenced by users.department_id (which document-creating
    department a user belongs to) and department_permissions.department_id
    (the RBAC matrix's row axis, see app/core/permissions.py). This used
    to be an ENUM('sales','procurement','warehouse') repeated on both of
    those tables plus scattered Python constants; it's a real table now
    so adding a department is a data change, not a migration + code edit
    in four places -- see migrations/2026-08-31_add_departments.sql.
    """

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="department_status"), nullable=False, default="active"
    )
