from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK, User


class CalendarEvent(Base, TimestampMixin, SoftDeleteMixin):
    """A single calendar entry, always visible to its creator. Also
    visible to every user in `mentions` (resolved from @username in the
    title/notes when it was created or last edited), or to every user at
    all when all_users is set (from @all). See calendar_service for the
    @-tag parsing, visibility resolution, and the ICS export.
    """

    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    all_users: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    creator: Mapped[User] = relationship(foreign_keys="CalendarEvent.created_by", lazy="joined")
    mentions: Mapped[list["CalendarEventMention"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", lazy="joined"
    )


class CalendarEventMention(Base):
    __tablename__ = "calendar_event_mentions"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("calendar_events.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(BigPK, ForeignKey("users.id"), nullable=False)

    event: Mapped[CalendarEvent] = relationship(back_populates="mentions")
    user: Mapped[User] = relationship(lazy="joined")
