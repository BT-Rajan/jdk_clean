from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    message: str
    link: str
    created_at: datetime


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    count: int
