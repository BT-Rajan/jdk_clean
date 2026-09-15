"""Per-customer/per-supplier overrides of the global approval thresholds
(settings_service.get_effective_po_approval_threshold /
get_effective_discount_approval_threshold) -- a party's own override, if
set, wins over the global setting; unset falls back to it; a zero/blank
override is treated as "no override" (same off-by-default semantics as
the global setting itself).
"""

from app.models.setting import Setting
from app.services import settings_service

from .factories import make_customer, make_supplier


def _set_global_po_threshold(db, value: str) -> None:
    db.add(Setting(setting_key="large_po_approval_threshold", setting_value=value))
    db.flush()


def _set_global_discount_threshold(db, value: str) -> None:
    db.add(Setting(setting_key="large_discount_approval_threshold", setting_value=value))
    db.flush()


def test_po_threshold_falls_back_to_global_when_supplier_has_no_override(db):
    _set_global_po_threshold(db, "5000")
    supplier = make_supplier(db)

    assert settings_service.get_effective_po_approval_threshold(db, supplier) == 5000.0


def test_po_threshold_uses_supplier_override_when_set(db):
    _set_global_po_threshold(db, "5000")
    supplier = make_supplier(db, po_approval_threshold_override=20000)

    assert settings_service.get_effective_po_approval_threshold(db, supplier) == 20000.0


def test_po_threshold_zero_override_treated_as_no_override(db):
    _set_global_po_threshold(db, "5000")
    supplier = make_supplier(db, po_approval_threshold_override=0)

    assert settings_service.get_effective_po_approval_threshold(db, supplier) == 5000.0


def test_po_threshold_with_no_supplier_and_no_global_is_off(db):
    assert settings_service.get_effective_po_approval_threshold(db, None) is None


def test_discount_threshold_uses_customer_override_when_set(db):
    _set_global_discount_threshold(db, "10")
    customer = make_customer(db, discount_approval_threshold_override=25)

    assert settings_service.get_effective_discount_approval_threshold(db, customer=customer) == 25.0


def test_discount_threshold_uses_supplier_override_when_set(db):
    _set_global_discount_threshold(db, "10")
    supplier = make_supplier(db, discount_approval_threshold_override=15)

    assert settings_service.get_effective_discount_approval_threshold(db, supplier=supplier) == 15.0


def test_discount_threshold_falls_back_to_global_with_no_party(db):
    _set_global_discount_threshold(db, "10")

    assert settings_service.get_effective_discount_approval_threshold(db) == 10.0


def test_discount_threshold_customer_override_does_not_leak_to_supplier_call(db):
    """A customer's override only ever applies when this document's party
    IS that customer -- passing a supplier that has no override of its
    own must fall back to the global setting, not pick up some other
    party's override by accident."""
    _set_global_discount_threshold(db, "10")
    make_customer(db, discount_approval_threshold_override=99)
    supplier = make_supplier(db)

    assert settings_service.get_effective_discount_approval_threshold(db, supplier=supplier) == 10.0
