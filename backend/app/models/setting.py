from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import BigPK


class Setting(Base):
    """A flat key-value row in the `settings` table (schema.sql -- this
    table has existed since the project's first commit; pdf_generator.py
    already reads company_* keys from it directly via raw SQL, with a
    comment noting no service/API/UI existed yet). This model and
    settings_service.py are that missing layer.
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    setting_key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    setting_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
