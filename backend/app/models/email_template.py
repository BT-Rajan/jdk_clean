from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.user import BigPK


class EmailTemplate(Base, TimestampMixin):
    """The subject/body an automated or one-click document email goes
    out with -- see email_template_service.py for the fixed registry of
    keys (order_confirmation, payment_reminder, ...) and how a template
    gets rendered. Editable, not deletable/creatable from the UI: the
    set of keys is defined in code (each one corresponds to an actual
    trigger somewhere in the app), so the row for a given key always
    exists (auto-created from that key's default on first read) rather
    than being a document someone builds from scratch.
    """

    __tablename__ = "email_templates"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    template_key: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
