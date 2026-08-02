from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.calendar_event import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, MentionableUserOut
from app.services import calendar_service

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/events", response_model=list[CalendarEventOut])
def list_events(
    year: int = Query(..., ge=1970, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    events = calendar_service.list_events_for_month(db, user, year, month)
    return [CalendarEventOut.from_model(e, user.id) for e in events]


@router.get("/events.ics")
def export_ics(
    year: int = Query(..., ge=1970, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    events = calendar_service.list_events_for_month(db, user, year, month)
    ics_text = calendar_service.build_ics(events)
    return Response(
        content=ics_text,
        media_type="text/calendar",
        headers={"Content-Disposition": f"attachment; filename=calendar-{year:04d}-{month:02d}.ics"},
    )


@router.get("/mentionable-users", response_model=list[MentionableUserOut])
def mentionable_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return calendar_service.list_mentionable_users(db)


@router.post("/events", response_model=CalendarEventOut, status_code=201)
def create_event(
    payload: CalendarEventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = calendar_service.create_event(db, user, payload)
    return CalendarEventOut.from_model(event, user.id)


@router.put("/events/{event_id}", response_model=CalendarEventOut)
def update_event(
    event_id: int,
    payload: CalendarEventUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = calendar_service.update_event(db, user, event_id, payload)
    return CalendarEventOut.from_model(event, user.id)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    calendar_service.delete_event(db, user, event_id)
