from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.payment import CollectionQueueRowOut
from app.services import payment_service

router = APIRouter(prefix="/api/collection-queue", tags=["payments"])
read_guard = require_page_access("payments", "read")


@router.get("", response_model=list[CollectionQueueRowOut])
def list_collection_queue(
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    return payment_service.list_collection_queue(db, user=user)
