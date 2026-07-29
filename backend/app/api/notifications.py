from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.notification import NotificationsOut
from app.services import notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsOut)
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = notification_service.get_notifications(db, user)
    return {"items": items, "count": len(items)}
