from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError
from app.models.delivery_note import DeliveryNote
from app.models.feasibility import FeasibilityCheck
from app.models.order import Order
from app.models.production_schedule import ProductionSchedule
from app.models.quotation import Quotation

# Answers "where is this order, right now" by walking the real chain that
# already links these five tables -- nothing new is stored here, this is
# the query nobody was writing:
#
#   feasibility_checks  <-- quotations.feasibility_id
#   quotations.converted_order_id  --> orders
#   production_schedules.order_id  --> orders
#   delivery_notes.order_id        --> orders
#
# Every prior module (feasibility, quotation, order, production,
# delivery) already writes these foreign keys as a side effect of its own
# normal workflow -- this just reads them all in one place instead of
# five separate screens.


def get_order_journey(db: Session, order_id: int) -> dict:
    order = (
        db.query(Order)
        .options(joinedload(Order.customer))
        .filter(Order.id == order_id, Order.deleted_at.is_(None))
        .first()
    )
    if order is None:
        raise NotFoundError("Order")

    quotation = (
        db.query(Quotation)
        .filter(Quotation.converted_order_id == order_id, Quotation.deleted_at.is_(None))
        .first()
    )

    feasibility = None
    if quotation is not None and quotation.feasibility_id is not None:
        feasibility = (
            db.query(FeasibilityCheck)
            .filter(FeasibilityCheck.id == quotation.feasibility_id, FeasibilityCheck.deleted_at.is_(None))
            .first()
        )

    batches = (
        db.query(ProductionSchedule)
        .options(joinedload(ProductionSchedule.product), joinedload(ProductionSchedule.machine))
        .filter(ProductionSchedule.order_id == order_id, ProductionSchedule.deleted_at.is_(None))
        .order_by(ProductionSchedule.scheduled_start)
        .all()
    )

    deliveries = (
        db.query(DeliveryNote)
        .filter(DeliveryNote.order_id == order_id, DeliveryNote.deleted_at.is_(None))
        .order_by(DeliveryNote.delivery_date)
        .all()
    )

    return {
        "order": {
            "id": order.id,
            "order_number": order.order_number,
            "status": order.status,
            "order_date": order.order_date,
            "requested_delivery_date": order.requested_delivery_date,
            "confirmed_delivery_date": order.confirmed_delivery_date,
            "total_amount": float(order.total_amount),
            "customer_name": order.customer.name if order.customer else None,
            "admin_review_required": order.admin_review_required,
            "created_at": order.created_at,
        },
        "feasibility": (
            {
                "id": feasibility.id,
                "feasibility_number": feasibility.feasibility_number,
                "status": feasibility.status,
                "required_by_date": feasibility.required_by_date,
                "created_at": feasibility.created_at,
                "checked_at": feasibility.checked_at,
            }
            if feasibility
            else None
        ),
        "quotation": (
            {
                "id": quotation.id,
                "quotation_number": quotation.quotation_number,
                "status": quotation.status,
                "quotation_date": quotation.quotation_date,
                "total_amount": float(quotation.total_amount),
                "created_at": quotation.created_at,
            }
            if quotation
            else None
        ),
        "production_batches": [
            {
                "id": b.id,
                "batch_number": b.batch_number,
                "status": b.status,
                "product_name": b.product.name if b.product else None,
                "machine_name": b.machine.name if b.machine else None,
                "planned_quantity": float(b.planned_quantity),
                "produced_quantity": float(b.produced_quantity),
                "scheduled_start": b.scheduled_start,
                "scheduled_end": b.scheduled_end,
                "created_at": b.created_at,
                "actual_start": b.actual_start,
                "actual_end": b.actual_end,
            }
            for b in batches
        ],
        "delivery_notes": [
            {
                "id": d.id,
                "delivery_note_number": d.delivery_note_number,
                "status": d.status,
                "delivery_date": d.delivery_date,
                "created_at": d.created_at,
            }
            for d in deliveries
        ],
    }
