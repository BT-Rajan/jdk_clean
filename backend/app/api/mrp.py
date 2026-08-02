from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.mrp import MrpReport
from app.services import mrp_service

router = APIRouter(prefix="/api/mrp", tags=["mrp"])

read_guard = require_page_access("mrp", "read")


@router.get("", response_model=MrpReport)
def get_mrp_report(
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    items = mrp_service.compute_requirements(db)
    return MrpReport(generated_at=datetime.now(timezone.utc), items=items)
