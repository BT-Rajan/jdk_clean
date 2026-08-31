from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import BigPK

if TYPE_CHECKING:
    from app.models.department import Department


class DepartmentPermission(Base):
    __tablename__ = "department_permissions"
    __table_args__ = (UniqueConstraint("department_id", "page_key", name="uq_dept_perm_id"),)

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    department_id: Mapped[int] = mapped_column(BigPK, ForeignKey("departments.id"), nullable=False)
    department: Mapped["Department"] = relationship("Department", lazy="joined")
    page_key: Mapped[str] = mapped_column(nullable=False)
    access_level: Mapped[str] = mapped_column(
        Enum("none", "read", "write", name="dept_perm_access_level"), nullable=False, default="none"
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
