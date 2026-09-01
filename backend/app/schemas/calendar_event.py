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


class DaySnapshotProductionOut(BaseModel):
    id: int
    batch_number: str
    product_code: str | None = None
    product_name: str | None = None
    status: str
    planned_quantity: float
    produced_quantity: float

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(batch) -> "DaySnapshotProductionOut":
        data = DaySnapshotProductionOut.model_validate(batch)
        data.product_code = batch.product.code if batch.product else None
        data.product_name = batch.product.name if batch.product else None
        return data


class DaySnapshotSaleOut(BaseModel):
    id: int
    order_number: str
    customer_name: str | None = None
    status: str
    total_amount: float

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(order) -> "DaySnapshotSaleOut":
        data = DaySnapshotSaleOut.model_validate(order)
        data.customer_name = order.customer.name if order.customer else None
        return data


class DaySnapshotOut(BaseModel):
    date: date
    production: list[DaySnapshotProductionOut]
    sales: list[DaySnapshotSaleOut]
    # Whether "Log production"/"Log a sale" can still target this date --
    # not in the future, not more than MAX_BACKDATE_DAYS in the past (see
    # core/workflow.py's is_within_backdate_window).
    can_log: bool
