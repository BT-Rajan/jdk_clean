"""order_service.get_fulfillment -- the Ordered / Allocated / Produced /
Delivered / Remaining view (Sales spec section 8), built from existing
data only: released FG stock for Allocated, and the completed executions
of production orders raised against THIS order line for Produced."""

from datetime import date, datetime

from app.models.inventory import FinishedGoodsInventory
from app.models.production_execution import ProductionExecution
from app.services import order_service

from .factories import (
    make_customer,
    make_order,
    make_product,
    make_production_order,
    make_production_schedule,
)

DUE = date(2027, 1, 31)


def _execution(db, po, product, produced, released=0, rejected=0, status="completed"):
    schedule = make_production_schedule(
        db, product_id=product.id, planned_quantity=produced, scheduled_start=date(2026, 1, 1), scheduled_end=date(2026, 1, 5)
    )
    execution = ProductionExecution(
        production_order_id=po.id,
        schedule_id=schedule.id,
        product_id=product.id,
        planned_quantity=produced,
        produced_quantity=produced,
        released_quantity=released,
        rejected_quantity=rejected,
        started_at=datetime(2026, 1, 1, 8, 0),
        status=status,
    )
    db.add(execution)
    db.flush()
    return execution


def _order_with_line(db, quantity=1000):
    product = make_product(db)
    order = make_order(
        db,
        make_customer(db).id,
        lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 5}],
        status="confirmed",
    )
    return order, product


def test_produced_released_rejected_and_qc_pending_come_from_the_lines_own_production(db):
    order, product = _order_with_line(db, 1000)
    detail = order.lines[0]
    po = make_production_order(db, order.id, detail.id, product.id, 300, DUE)
    _execution(db, po, product, produced=200, released=150, rejected=20)

    line = order_service.get_fulfillment(db, order.id)[0]

    assert line["ordered_quantity"] == 1000
    assert line["produced_quantity"] == 200
    assert line["released_quantity"] == 150
    assert line["rejected_quantity"] == 20
    assert line["qc_pending_quantity"] == 30  # 200 produced - 150 released - 20 rejected, still awaiting QC
    assert line["delivered_quantity"] == 0
    assert line["remaining_quantity"] == 1000


def test_allocated_is_what_released_stock_covers_capped_at_whats_remaining(db):
    order, product = _order_with_line(db, 1000)
    db.add(FinishedGoodsInventory(product_id=product.id, quantity_on_hand=700))
    db.flush()

    line = order_service.get_fulfillment(db, order.id)[0]

    assert line["allocated_quantity"] == 700
    assert line["allocated_quantity"] == line["fulfillable_now"]
    assert line["shortage"] == 300

    # more stock than the order needs -> allocation stops at the order
    db.query(FinishedGoodsInventory).filter_by(product_id=product.id).update({"quantity_on_hand": 5000})
    db.flush()
    assert order_service.get_fulfillment(db, order.id)[0]["allocated_quantity"] == 1000


def test_stock_only_cancelled_and_unfinished_production_never_counts_as_produced_for_the_order(db):
    order, product = _order_with_line(db, 1000)
    detail = order.lines[0]

    stock_only = make_production_order(db, None, None, product.id, 500, DUE)  # general FG, no customer order
    _execution(db, stock_only, product, produced=500, released=500)

    cancelled = make_production_order(db, order.id, detail.id, product.id, 100, DUE, status="cancelled")
    _execution(db, cancelled, product, produced=100, released=100)

    running = make_production_order(db, order.id, detail.id, product.id, 100, DUE)
    _execution(db, running, product, produced=40, status="in_progress")  # not complete yet

    line = order_service.get_fulfillment(db, order.id)[0]

    assert line["produced_quantity"] == 0
    assert line["released_quantity"] == 0
    assert line["qc_pending_quantity"] == 0
