from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.timezone import now_kuwait_naive

# Python-side defaults (evaluated by SQLAlchemy at insert/update time),
# not server_default/onupdate=func.now() -- this app's DB server runs
# with time_zone=SYSTEM, which is UTC in every environment this has been
# deployed to, so MySQL's own NOW()/CURRENT_TIMESTAMP would silently
# stamp every row in UTC despite Kuwait being the only business
# timezone (see core/timezone.py). Computing the value here instead
# means every ordinary write goes through the application layer's own
# Kuwait clock, per that module's own rule: "convert to/from Kuwait time
# exclusively through the server-side application layer." Only a raw
# SQL statement that bypasses the ORM entirely (schema.sql/migrations'
# own DEFAULT CURRENT_TIMESTAMP, kept as a DB-level fallback) would still
# see UTC -- no ordinary application code path does that.
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_kuwait_naive)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_kuwait_naive, onupdate=now_kuwait_naive
    )
    updated_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
