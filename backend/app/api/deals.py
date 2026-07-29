from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.deal_detail import DealDetailOut
from app.services import deal_detail_service

router = APIRouter(prefix="/api/deals", tags=["deals"])


@router.get("/{deal_id}", response_model=DealDetailOut)
def get_deal(deal_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return deal_detail_service.get_deal_detail(db, deal_id)
