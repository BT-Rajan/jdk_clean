"""Regression tests for the Payments hardening pass: mandatory reference
for non-cash payments, duplicate-payment prevention, Finance acknowledgment
vs. a bare Sales claim, the "no credit facility -> paid before production"
gate (wired into both the legacy production_service batch path and the
P6 production_execution_service path), Finance's override, the payment
follow-up worklist, the collection queue, and payment-plan completion.
"""

from datetime import date, datetime, timedelta

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import (
    payment_plan_service,
    payment_service,
    production_execution_service,
    production_order_material_service,
    production_order_schedule_service,
    production_service,
)

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_machine,
    make_order,
    make_product,
    make_production_order,
    make_raw_material,
    set_stock,
)

DUE = date(2026, 12, 1)


def _cash_customer(db, **overrides):
    """A customer with no credit facility -- the payment-before-production
    rule applies to them, unlike factories.make_customer's own default."""
    overrides.setdefault("credit_limit", 0)
    return make_customer(db, **overrides)


def _order_with_total(db, customer_id, total, **overrides):
    """make_order derives total_amount from its lines, so it can't also
    take total_amount as an override -- this builds a single line whose
    price is exactly `total` instead."""
    product = make_product(db)
    return make_order(
        db, customer_id, lines=[{"product_id": product.id, "quantity": 1, "unit_price": total}], **overrides
    )


def _ready_batch_for_order(db, order, planned_quantity=10, bom_quantity_per_unit=2, stock=1000):
    """A batch that can actually start (ample stock/machine capacity),
    linked to `order` -- so production_service.change_status's
    'planned' -> 'in_progress' transition exercises the payment gate."""
    from app.services import settings_service

    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=bom_quantity_per_unit, scrap_percent=0)
    set_stock(db, material.id, stock)

    start = settings_service.next_working_day(date(2026, 1, 1), settings_service.get_working_days(db))
    batch = production_service.create_batch(
        db,
        {
            "order_id": order.id,
            "product_id": product.id,
            "planned_quantity": planned_quantity,
            "scheduled_start": start,
            "scheduled_end": start,
            "machine_id": machine.id,
        },
    )
    return batch


def _po_with_schedule_for_order(db, order, quantity=500, bom_quantity_per_unit=1, stock=10_000):
    """P6 equivalent of _ready_batch_for_order -- a planned Production
    Order + schedule linked to `order`, ready for production_execution_
    service.start_execution."""
    machine = make_machine(db)
    material = make_raw_material(db)
    product = order.lines[0].product
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=bom_quantity_per_unit, scrap_percent=0)
    set_stock(db, material.id, stock)

    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, DUE)
    production_order_material_service.calculate(db, po.id)

    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)},
    )
    return po, schedule


# ---------------------------------------------------------------------------
# create_payment: mandatory reference for non-cash methods, duplicates
# ---------------------------------------------------------------------------


def test_non_cash_method_without_reference_is_rejected(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")

    with pytest.raises(ValidationAppError):
        payment_service.create_payment(
            db, order.id, {"amount": 100, "payment_date": date(2026, 1, 1), "method": "Bank transfer"}
        )


def test_cash_method_does_not_require_a_reference(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")

    payment = payment_service.create_payment(
        db, order.id, {"amount": 100, "payment_date": date(2026, 1, 1), "method": "Cash"}
    )
    assert payment.reference is None


def test_blank_method_does_not_require_a_reference(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")

    payment = payment_service.create_payment(db, order.id, {"amount": 100, "payment_date": date(2026, 1, 1)})
    assert payment.reference is None


def test_duplicate_reference_on_the_same_order_is_rejected(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")
    payment_service.create_payment(
        db,
        order.id,
        {"amount": 50, "payment_date": date(2026, 1, 1), "method": "Bank transfer", "reference": "TXN-1"},
    )

    with pytest.raises(ConflictError):
        payment_service.create_payment(
            db,
            order.id,
            {"amount": 50, "payment_date": date(2026, 1, 2), "method": "Bank transfer", "reference": "txn-1"},
        )


# ---------------------------------------------------------------------------
# Acknowledgment: claimed vs. acknowledged amount
# ---------------------------------------------------------------------------


def test_unacknowledged_payment_does_not_count_toward_acknowledged_amount(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")
    payment_service.create_payment(db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)})

    assert payment_service.get_order_amount_paid(db, order.id) == 50
    assert payment_service.get_order_amount_acknowledged(db, order.id) == 0


def test_acknowledge_payment_sets_acknowledged_fields(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")
    payment = payment_service.create_payment(db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)})

    acknowledged = payment_service.acknowledge_payment(db, order.id, payment.id, user_id=None)

    assert acknowledged.acknowledged_at is not None
    assert payment_service.get_order_amount_acknowledged(db, order.id) == 50


def test_acknowledging_an_already_acknowledged_payment_is_rejected(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")
    payment = payment_service.create_payment(db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)})
    payment_service.acknowledge_payment(db, order.id, payment.id)

    with pytest.raises(ConflictError):
        payment_service.acknowledge_payment(db, order.id, payment.id)


def test_create_payment_auto_acknowledges_when_flagged(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")

    payment = payment_service.create_payment(
        db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)}, auto_acknowledge=True
    )
    assert payment.acknowledged_at is not None
    assert payment_service.get_order_amount_acknowledged(db, order.id) == 50


# ---------------------------------------------------------------------------
# get_production_payment_block_reason / override
# ---------------------------------------------------------------------------


def test_credit_customer_is_never_blocked(db):
    customer = make_customer(db, credit_limit=100_000)  # has a credit facility
    order = _order_with_total(db, customer.id, 500, status="confirmed")

    assert payment_service.get_production_payment_block_reason(db, order) is None


def test_cash_customer_unpaid_order_is_blocked(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")

    reason = payment_service.get_production_payment_block_reason(db, order)
    assert reason is not None
    assert "credit facility" in reason


def test_cash_customer_fully_acknowledged_order_is_not_blocked(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")
    payment = payment_service.create_payment(db, order.id, {"amount": 500, "payment_date": date(2026, 1, 1)})
    payment_service.acknowledge_payment(db, order.id, payment.id)

    assert payment_service.get_production_payment_block_reason(db, order) is None


def test_cash_customer_partially_acknowledged_order_stays_blocked(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")
    payment = payment_service.create_payment(db, order.id, {"amount": 200, "payment_date": date(2026, 1, 1)})
    payment_service.acknowledge_payment(db, order.id, payment.id)

    assert payment_service.get_production_payment_block_reason(db, order) is not None


def test_override_clears_the_block(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")
    assert payment_service.get_production_payment_block_reason(db, order) is not None

    payment_service.override_payment_gate(db, order.id, "Customer is trusted, shipping window is tight.")

    assert payment_service.get_production_payment_block_reason(db, order) is None


def test_override_requires_a_reason(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")

    with pytest.raises(ValidationAppError):
        payment_service.override_payment_gate(db, order.id, "   ")


def test_override_on_a_credit_order_is_rejected(db):
    customer = make_customer(db, credit_limit=100_000)
    order = _order_with_total(db, customer.id, 500, status="confirmed")

    with pytest.raises(ValidationAppError):
        payment_service.override_payment_gate(db, order.id, "Not applicable here.")


# ---------------------------------------------------------------------------
# Production gates actually wired in
# ---------------------------------------------------------------------------


def test_legacy_batch_start_blocked_for_unpaid_cash_order(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 999999, status="confirmed")
    batch = _ready_batch_for_order(db, order)

    with pytest.raises(ConflictError, match="credit facility"):
        production_service.change_status(db, batch.id, "in_progress")


def test_legacy_batch_start_allowed_once_acknowledged(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")
    batch = _ready_batch_for_order(db, order)
    payment = payment_service.create_payment(
        db, order.id, {"amount": float(order.total_amount), "payment_date": date(2026, 1, 1)}
    )
    payment_service.acknowledge_payment(db, order.id, payment.id)

    started = production_service.change_status(db, batch.id, "in_progress")
    assert started.status == "in_progress"


def test_execution_start_blocked_for_unpaid_cash_order(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, lines=[{"product_id": make_product(db).id, "quantity": 500, "unit_price": 10}], status="confirmed")
    po, schedule = _po_with_schedule_for_order(db, order, quantity=500)

    with pytest.raises(ConflictError, match="credit facility"):
        production_execution_service.start_execution(db, po.id, schedule.id)


def test_execution_start_allowed_after_override(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, lines=[{"product_id": make_product(db).id, "quantity": 500, "unit_price": 10}], status="confirmed")
    po, schedule = _po_with_schedule_for_order(db, order, quantity=500)
    payment_service.override_payment_gate(db, order.id, "Finance approved shipping ahead of full payment.")

    execution = production_execution_service.start_execution(db, po.id, schedule.id)
    assert execution.status == "in_progress"


# ---------------------------------------------------------------------------
# Follow-up worklist + collection queue
# ---------------------------------------------------------------------------


def test_set_payment_followup_sets_and_clears(db):
    customer = _cash_customer(db)
    order = make_order(db, customer.id, status="confirmed")
    from .factories import make_user

    owner = make_user(db)

    updated = payment_service.set_payment_followup(db, order.id, owner.id, date(2026, 2, 1))
    assert updated.payment_followup_owner_id == owner.id
    assert updated.payment_followup_date == date(2026, 2, 1)

    cleared = payment_service.set_payment_followup(db, order.id, None, None)
    assert cleared.payment_followup_owner_id is None
    assert cleared.payment_followup_date is None


def test_collection_queue_includes_overdue_unpaid_order(db):
    customer = _cash_customer(db, payment_terms_days=7)
    order = _order_with_total(db, customer.id, 500, status="confirmed", order_date=date(2020, 1, 1))

    queue = payment_service.list_collection_queue(db)
    order_ids = [row["order_id"] for row in queue]
    assert order.id in order_ids


def test_collection_queue_excludes_not_yet_due_order(db):
    customer = _cash_customer(db, payment_terms_days=30)
    today = payment_service.now_kuwait_naive().date()
    order = _order_with_total(db, customer.id, 500, status="confirmed", order_date=today)

    queue = payment_service.list_collection_queue(db)
    order_ids = [row["order_id"] for row in queue]
    assert order.id not in order_ids


def test_due_date_derived_from_confirmed_at_when_present(db):
    customer = _cash_customer(db, payment_terms_days=10)
    order = make_order(
        db,
        customer.id,
        status="confirmed",
        order_date=date(2026, 1, 1),
        confirmed_at=datetime(2026, 1, 15, 9, 0),
    )
    status = payment_service.get_order_payment_status(db, order, as_of=date(2026, 1, 20))
    assert status["due_date"] == date(2026, 1, 25)
    assert status["overdue_days"] == 0  # not yet past due


# ---------------------------------------------------------------------------
# Payment plan completion
# ---------------------------------------------------------------------------


def test_complete_payment_plan_blocked_while_outstanding_remains(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")
    plan = payment_plan_service.create_payment_plan(
        db, order.id, {"amount": 500, "target_date": date(2026, 3, 1)}
    )

    with pytest.raises(ConflictError):
        payment_plan_service.complete_payment_plan(db, order.id, plan.id)


def test_complete_payment_plan_succeeds_once_fully_acknowledged(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")
    plan = payment_plan_service.create_payment_plan(
        db, order.id, {"amount": 500, "target_date": date(2026, 3, 1)}
    )
    payment = payment_service.create_payment(db, order.id, {"amount": 500, "payment_date": date(2026, 1, 1)})
    payment_service.acknowledge_payment(db, order.id, payment.id)

    completed = payment_plan_service.complete_payment_plan(db, order.id, plan.id)
    assert completed.status == "completed"
    assert completed.completed_at is not None


def test_completing_an_already_completed_plan_is_rejected(db):
    customer = _cash_customer(db)
    order = _order_with_total(db, customer.id, 500, status="confirmed")
    plan = payment_plan_service.create_payment_plan(
        db, order.id, {"amount": 500, "target_date": date(2026, 3, 1)}
    )
    payment = payment_service.create_payment(db, order.id, {"amount": 500, "payment_date": date(2026, 1, 1)})
    payment_service.acknowledge_payment(db, order.id, payment.id)
    payment_plan_service.complete_payment_plan(db, order.id, plan.id)

    with pytest.raises(ConflictError):
        payment_plan_service.complete_payment_plan(db, order.id, plan.id)
