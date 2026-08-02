from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.deal_detail import DealDetailOut
from app.services import deal_detail_service

router = APIRouter(prefix="/api/deals", tags=["deals"])

read_guard = require_page_access("deals", "read")


@router.get("/{deal_id}", response_model=DealDetailOut)
def get_deal(deal_id: int, db: Session = Depends(get_db), _: User = Depends(read_guard)):
    return deal_detail_service.get_deal_detail(db, deal_id)
