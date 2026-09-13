from __future__ import annotations

import re
from datetime import date, datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, PermissionError_
from app.core.workflow import is_within_backdate_window
from app.models.calendar_event import CalendarEvent, CalendarEventMention
from app.models.order import Order
from app.models.production_schedule import ProductionSchedule
from app.models.user import User
from app.schemas.calendar_event import CalendarEventCreate, CalendarEventUpdate

# Matches @all or @username inside the title/notes. Usernames in this
# app are alphanumeric plus '_' and '.' (see User.username), so that's
# all this needs to recognize -- no need to match arbitrary text.
_MENTION_RE = re.compile(r"@(all|[A-Za-z0-9_.]+)")


def _parse_mentions(*texts: str | None) -> tuple[bool, set[str]]:
    """Scans the given strings for @mentions. Returns (all_users,
    {usernames}) -- usernames are lowercased for a case-insensitive match
    against User.username."""
    all_users = False
    usernames: set[str] = set()
    for text in texts:
        if not text:
            continue
        for match in _MENTION_RE.finditer(text):
            tag = match.group(1).lower()
            if tag == "all":
                all_users = True
            else:
                usernames.add(tag)
    return all_users, usernames


def _resolve_mention_users(db: Session, usernames: set[str]) -> list[User]:
    if not usernames:
        return []
    return (
        db.query(User)
        .filter(User.deleted_at.is_(None), User.username.in_(usernames))
        .all()
    )


def _apply_mentions(db: Session, event: CalendarEvent, user_id: int) -> None:
    all_users, usernames = _parse_mentions(event.title, event.notes)
    event.all_users = all_users
    event.mentions.clear()
    for mentioned in _resolve_mention_users(db, usernames):
        if mentioned.id == user_id:
            continue  # creator already sees their own entry
        event.mentions.append(CalendarEventMention(user_id=mentioned.id))


def list_events_for_month(db: Session, user: User, year: int, month: int) -> list[CalendarEvent]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    return (
        db.query(CalendarEvent)
        .outerjoin(CalendarEventMention, CalendarEventMention.event_id == CalendarEvent.id)
        .filter(
            CalendarEvent.deleted_at.is_(None),
            CalendarEvent.event_date >= start,
            CalendarEvent.event_date < end,
            or_(
                CalendarEvent.created_by == user.id,
                CalendarEvent.all_users.is_(True),
                CalendarEventMention.user_id == user.id,
            ),
        )
        .distinct()
        .order_by(CalendarEvent.event_date, CalendarEvent.id)
        .all()
    )


def create_event(db: Session, user: User, payload: CalendarEventCreate) -> CalendarEvent:
    event = CalendarEvent(
        event_date=payload.event_date,
        title=payload.title.strip(),
        notes=payload.notes.strip() if payload.notes else None,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(event)
    db.flush()
    _apply_mentions(db, event, user.id)
    db.commit()
    db.refresh(event)
    return event


def _get_own_event(db: Session, user: User, event_id: int) -> CalendarEvent:
    event = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.id == event_id, CalendarEvent.deleted_at.is_(None))
        .first()
    )
    if event is None:
        raise NotFoundError("Calendar entry")
    if event.created_by != user.id:
        raise PermissionError_("Only the person who created this entry can change it.")
    return event


def update_event(db: Session, user: User, event_id: int, payload: CalendarEventUpdate) -> CalendarEvent:
    event = _get_own_event(db, user, event_id)
    event.event_date = payload.event_date
    event.title = payload.title.strip()
    event.notes = payload.notes.strip() if payload.notes else None
    event.updated_by = user.id
    _apply_mentions(db, event, user.id)
    db.commit()
    db.refresh(event)
    return event


def delete_event(db: Session, user: User, event_id: int) -> None:
    event = _get_own_event(db, user, event_id)
    event.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    event.updated_by = user.id
    db.commit()


def get_day_snapshot(db: Session, target_date: date) -> dict:
    """What's already logged against `target_date` -- production batches
    scheduled/completed for that day and sales orders dated that day --
    plus whether it's still a legal target for "Log production"/"Log a
    sale" (see core/workflow.MAX_BACKDATE_DAYS). Powers the calendar's
    day-actions popup: a snapshot of what happened, alongside the option
    to log something that hasn't been entered yet.
    """
    today = datetime.now(timezone.utc).date()

    batches = (
        db.query(ProductionSchedule)
        .options(joinedload(ProductionSchedule.product))
        .filter(ProductionSchedule.deleted_at.is_(None), ProductionSchedule.scheduled_start == target_date)
        .order_by(ProductionSchedule.id)
        .all()
    )
    orders = (
        db.query(Order)
        .options(joinedload(Order.customer))
        .filter(Order.deleted_at.is_(None), Order.order_date == target_date)
        .order_by(Order.id)
        .all()
    )
    return {
        "date": target_date,
        "production": batches,
        "sales": orders,
        "can_log": is_within_backdate_window(target_date, today),
    }


def list_mentionable_users(db: Session) -> list[User]:
    return (
        db.query(User)
        .filter(User.deleted_at.is_(None), User.is_active.is_(True))
        .order_by(User.full_name)
        .all()
    )

