from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError
from app.models.deal import Deal
from app.models.delivery_note import DeliveryNote
from app.models.feasibility import FeasibilityCheck
from app.models.order import Order
from app.models.production_schedule import ProductionSchedule
from app.models.quotation import Quotation


def get_deal_detail(db: Session, deal_id: int) -> dict:
    """Everything under one deal. Lists, not singulars -- the loose
    grouping means a deal could in principle have more than one
    feasibility check or quotation (e.g. a re-quote), not just the
    single-order chain Order Journey shows. Nothing here is a new query
    concept: it's the same feasibility/quotation/order/production/
    delivery tables, just all filtered by deal_id instead of chased via
    each other's foreign keys.
    """
    deal = (
        db.query(Deal)
        .options(joinedload(Deal.customer))
        .filter(Deal.id == deal_id, Deal.deleted_at.is_(None))
        .first()
    )
    if deal is None:
        raise NotFoundError("Deal")

    feasibility_checks = (
        db.query(FeasibilityCheck)
        .filter(FeasibilityCheck.deal_id == deal_id, FeasibilityCheck.deleted_at.is_(None))
        .order_by(FeasibilityCheck.created_at)
        .all()
    )
    quotations = (
        db.query(Quotation)
        .filter(Quotation.deal_id == deal_id, Quotation.deleted_at.is_(None))
        .order_by(Quotation.created_at)
        .all()
    )
    orders = (
        db.query(Order)
        .options(joinedload(Order.customer))
        .filter(Order.deal_id == deal_id, Order.deleted_at.is_(None))
        .order_by(Order.created_at)
        .all()
    )
    order_ids = [o.id for o in orders]

    batches = []
    deliveries = []
    if order_ids:
        batches = (
            db.query(ProductionSchedule)
            .options(joinedload(ProductionSchedule.product))
            .filter(ProductionSchedule.order_id.in_(order_ids), ProductionSchedule.deleted_at.is_(None))
            .order_by(ProductionSchedule.scheduled_start)
            .all()
        )
        deliveries = (
            db.query(DeliveryNote)
            .filter(DeliveryNote.order_id.in_(order_ids), DeliveryNote.deleted_at.is_(None))
            .order_by(DeliveryNote.delivery_date)
            .all()
        )

    return {
        "id": deal.id,
        "deal_number": deal.deal_number,
        "customer_id": deal.customer_id,
        "customer_name": deal.customer.name if deal.customer else None,
        "furthest_stage": deal.furthest_stage,
        "status": deal.status,
        "created_at": deal.created_at,
        "feasibility_checks": [
            {"id": f.id, "feasibility_number": f.feasibility_number, "status": f.status}
            for f in feasibility_checks
        ],
        "quotations": [
            {
                "id": q.id,
                "quotation_number": q.quotation_number,
                "status": q.status,
                "total_amount": float(q.total_amount),
                "auto_created": q.auto_created,
            }
            for q in quotations
        ],
        "orders": [
            {"id": o.id, "order_number": o.order_number, "status": o.status, "total_amount": float(o.total_amount)}
            for o in orders
        ],
        "production_batches": [
            {
                "id": b.id,
                "batch_number": b.batch_number,
                "status": b.status,
                "product_name": b.product.name if b.product else None,
            }
            for b in batches
        ],
        "delivery_notes": [
            {"id": d.id, "delivery_note_number": d.delivery_note_number, "status": d.status}
            for d in deliveries
        ],
    }
