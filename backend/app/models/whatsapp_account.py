from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.user import BigPK


class WhatsAppAccount(Base, TimestampMixin):
    """Communication module, WhatsApp channel: a single admin-configured
    Meta WhatsApp Business Cloud API sender. `access_token_encrypted` is
    Fernet-encrypted (see core/crypto.py) -- never read or returned as
    plaintext outside whatsapp_account_service.

    Deliberately template-only: nothing in this model or its service
    supports a free-form message. Every send goes through a template
    name that was fetched live (APPROVED status) from Meta's own
    /message_templates endpoint -- see
    whatsapp_account_service.list_templates / send_template.
    """

    __tablename__ = "whatsapp_accounts"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    phone_number_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    waba_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    display_phone_number: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    verified_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_version: Mapped[str] = mapped_column(String(10), nullable=False, default="v21.0")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_test_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
