from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.dashboard import DashboardStatsOut
from app.services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

read_guard = require_page_access("dashboard", "read")


@router.get("/stats", response_model=DashboardStatsOut)
def get_dashboard_stats(db: Session = Depends(get_db), user: User = Depends(read_guard)):
    return dashboard_service.get_stats(db)
