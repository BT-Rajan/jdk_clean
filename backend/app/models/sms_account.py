from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.user import BigPK


class SmsAccount(Base, TimestampMixin):
    """Communication module, SMS channel: a single admin-configured bulk
    SMS account for one of Kuwait's common gateway operators, or a
    custom HTTP endpoint. `api_password_encrypted` is Fernet-encrypted
    (see core/crypto.py) -- never read or returned as plaintext outside
    sms_account_service. Only one row is ever active; see
    sms_account_service.get_active.
    """

    __tablename__ = "sms_accounts"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="kwtsms")
    sender_id: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    api_url: Mapped[str] = mapped_column(String(255), nullable=False, default="https://www.kwtsms.com/API/send/")
    api_username: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    api_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # kwtSMS-specific: queues the message without actually delivering it
    # to a handset, so admins can validate credentials/wiring without
    # burning credit or spamming a real phone. Harmless no-op for
    # providers whose adapter doesn't use it.
    test_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_test_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
