"""Sales/Customer Order review items #3, #4, #7 -- covers what's new in
this pass: confirmed_delivery_date is committed automatically the
moment an order is confirmed (order_service.change_status), can only be
revised afterwards through the reason-required order_service.
change_delivery_date, and get_order_block_status gives a read-only
preview of why a draft order can't yet be confirmed.
"""

from datetime import date

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.models.setting import Setting
from app.services import order_service

from .factories import make_customer, make_order


def test_confirm_commits_confirmed_delivery_date_from_requested(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, requested_delivery_date=date(2026, 3, 1))
    assert order.confirmed_delivery_date is None

    confirmed = order_service.change_status(db, order.id, "confirmed")

    assert confirmed.confirmed_delivery_date == date(2026, 3, 1)


def test_confirm_does_not_overwrite_an_explicitly_set_confirmed_date(db):
    customer = make_customer(db)
    order = make_order(
        db,
        customer.id,
        requested_delivery_date=date(2026, 3, 1),
        confirmed_delivery_date=date(2026, 3, 10),
    )

    confirmed = order_service.change_status(db, order.id, "confirmed")

    assert confirmed.confirmed_delivery_date == date(2026, 3, 10)


def test_change_delivery_date_requires_a_reason(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="confirmed", confirmed_delivery_date=date(2026, 3, 1))

    with pytest.raises(ValidationAppError):
        order_service.change_delivery_date(db, order.id, date(2026, 3, 15), "")


def test_change_delivery_date_updates_and_is_recorded(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="confirmed", confirmed_delivery_date=date(2026, 3, 1))

    updated = order_service.change_delivery_date(
        db, order.id, date(2026, 3, 15), "Customer requested a two-week push."
    )

    assert updated.confirmed_delivery_date == date(2026, 3, 15)


def test_change_delivery_date_rejected_on_draft_orders(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="draft")

    with pytest.raises(ConflictError):
        order_service.change_delivery_date(db, order.id, date(2026, 3, 15), "Some reason")


def test_change_delivery_date_rejected_once_delivered(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="delivered", confirmed_delivery_date=date(2026, 3, 1))

    with pytest.raises(ConflictError):
        order_service.change_delivery_date(db, order.id, date(2026, 3, 15), "Too late now")


def test_change_delivery_date_rejected_once_cancelled(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="cancelled", confirmed_delivery_date=date(2026, 3, 1))

    with pytest.raises(ConflictError):
        order_service.change_delivery_date(db, order.id, date(2026, 3, 15), "Order is cancelled")


def test_block_status_reports_not_blocked_for_confirmed_order(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="confirmed")

    status = order_service.get_order_block_status(db, order.id)

    assert status == {"blocked": False, "reasons": [], "requires_admin_approval": False}


def test_block_status_reports_not_blocked_for_plain_draft_order(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="draft")

    status = order_service.get_order_block_status(db, order.id)

    assert status["blocked"] is False
    assert status["reasons"] == []


def test_block_status_flags_large_discount_before_confirm_is_attempted(db):
    db.add(Setting(setting_key="large_discount_approval_threshold", setting_value="20"))
    db.flush()
    customer = make_customer(db)
    order = make_order(db, customer.id, status="draft", discount_percent=50)

    status = order_service.get_order_block_status(db, order.id)

    assert status["blocked"] is True
    assert status["requires_admin_approval"] is True
    assert any("discount" in reason for reason in status["reasons"])

    # And attempting the real transition fails for the same reason --
    # the preview and the enforcement point are the same computation.
    with pytest.raises(ConflictError):
        order_service.change_status(db, order.id, "confirmed")
