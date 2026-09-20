from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.core.timezone import now_kuwait_naive
from app.models.user import User
from app.schemas.mrp import MrpReport
from app.schemas.purchase_order import PurchaseOrderOut
from app.services import mrp_service, purchase_order_service

router = APIRouter(prefix="/api/mrp", tags=["mrp"])

read_guard = require_page_access("mrp", "read")
write_guard = require_page_access("mrp", "write")


@router.get("", response_model=MrpReport)
def get_mrp_report(
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    items = mrp_service.compute_requirements(db)
    by_source = mrp_service.group_by_source(items)
    return MrpReport(generated_at=now_kuwait_naive(), items=items, by_source=by_source)


class MrpCreatePoRequest(BaseModel):
    raw_material_id: int = Field(gt=0)
    supplier_id: int = Field(gt=0)
    quantity: float = Field(gt=0)


@router.post("/create-po", response_model=PurchaseOrderOut, status_code=201)
def create_po_for_shortage(
    payload: MrpCreatePoRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """One-click "Create PO" directly against a single MRP shortage's
    suggested purchase -- see purchase_order_service.
    create_purchase_order_for_shortage. Distinct from the bulk
    /api/purchase-orders/auto-draft-from-mrp pass, which drafts every
    current shortage's suggestions at once."""
    po = purchase_order_service.create_purchase_order_for_shortage(
        db, payload.raw_material_id, payload.supplier_id, payload.quantity, user_id=user.id
    )
    return PurchaseOrderOut.from_model(po)
