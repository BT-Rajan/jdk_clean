from datetime import date

from pydantic import BaseModel, Field


class CalendarEventCreate(BaseModel):
    event_date: date
    title: str = Field(min_length=1, max_length=200)
    notes: str | None = None


class CalendarEventUpdate(BaseModel):
    event_date: date
    title: str = Field(min_length=1, max_length=200)
    notes: str | None = None


class CalendarEventOut(BaseModel):
    id: int
    event_date: date
    title: str
    notes: str | None = None
    all_users: bool
    created_by: int
    created_by_name: str
    mentioned_usernames: list[str] = []
    # True when the current user created this entry -- only they can
    # edit/delete it; everyone else it's shared with sees it read-only.
    is_own: bool

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(event, current_user_id: int) -> "CalendarEventOut":
        return CalendarEventOut(
            id=event.id,
            event_date=event.event_date,
            title=event.title,
            notes=event.notes,
            all_users=event.all_users,
            created_by=event.created_by,
            created_by_name=event.creator.full_name if event.creator else "",
            mentioned_usernames=sorted(m.user.username for m in event.mentions if m.user),
            is_own=event.created_by == current_user_id,
        )


class MentionableUserOut(BaseModel):
    id: int
    username: str
    full_name: str

    model_config = {"from_attributes": True}
