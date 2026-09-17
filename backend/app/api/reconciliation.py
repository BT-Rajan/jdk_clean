from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.reconciliation import ReconciliationExceptionOut
from app.services import reconciliation_service

router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])
# Reuses the existing "production" page key -- reconciliation exceptions
# span production, inventory, QC and delivery, all already governed
# together under Production for a staff user (see production_orders.py's
# own comment on the same reuse). Read-only: this whole feature never
# writes anything, so there is no corresponding write_guard.
read_guard = require_page_access("production", "read")


@router.get("/exceptions", response_model=list[ReconciliationExceptionOut])
def list_exceptions(db: Session = Depends(get_db), _: User = Depends(read_guard)):
    return reconciliation_service.get_exceptions(db)
