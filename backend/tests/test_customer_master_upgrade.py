"""Client Master hardening upgrade -- covers what's new in
app/crud/master_data.py's CustomerCRUD: the email duplicate-check
(mirroring the pre-existing phone one), the credit-terms cross-field
check on update (create's equivalent is already covered by schema-level
tests against CustomerCreate itself, not the DB), and that the
code-lock still holds with the new fields present.
"""

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.crud.master_data import CustomerCRUD

from .factories import make_customer

crud = CustomerCRUD()


def test_duplicate_email_rejected_on_create(db):
    make_customer(db, email="ali@example.com")

    with pytest.raises(ConflictError):
        crud.create(db, {"customer_type": "business", "name": "Another Co", "email": "ali@example.com"})


def test_duplicate_email_case_insensitive(db):
    make_customer(db, email="ali@example.com")

    with pytest.raises(ConflictError):
        crud.create(db, {"customer_type": "business", "name": "Another Co", "email": "ALI@EXAMPLE.COM"})


def test_duplicate_email_ignored_when_blank(db):
    make_customer(db, email=None)
    # Should not raise -- a second customer with no email on file is not
    # a duplicate of anything. payment_terms_type/days included here the
    # same way CustomerCreate's own defaults would supply them before
    # this ever reaches the CRUD layer in production -- crud.create is
    # called directly with a bare dict in this test file, bypassing that
    # schema layer, so the defaults have to be supplied by hand.
    created = crud.create(
        db,
        {"customer_type": "business", "name": "Another Co", "payment_terms_type": "credit", "payment_terms_days": 30},
    )
    assert created.email is None


def test_duplicate_email_excludes_self_on_update(db):
    customer = make_customer(db, email="ali@example.com")
    # Re-saving the same customer with the same email must not trip the
    # duplicate check against itself.
    updated = crud.update(db, customer.id, {"email": "ali@example.com"})
    assert updated.email == "ali@example.com"


def test_credit_terms_requires_days_on_update(db):
    customer = make_customer(db, payment_terms_type="cash", payment_terms_days=0)

    with pytest.raises(ValidationAppError):
        crud.update(db, customer.id, {"payment_terms_type": "credit"})


def test_credit_terms_falls_back_to_existing_days_on_partial_update(db):
    # Already credit with 45 days on file; updating an unrelated field
    # shouldn't re-trigger the check using some other default.
    customer = make_customer(db, payment_terms_type="credit", payment_terms_days=45)
    updated = crud.update(db, customer.id, {"category": "VIP"})
    assert updated.payment_terms_days == 45
    assert updated.category == "VIP"


def test_credit_terms_falls_back_to_existing_type_when_only_days_changes(db):
    # Already cash; just raising payment_terms_days shouldn't force
    # credit-terms validation against the (unrelated) new day count.
    customer = make_customer(db, payment_terms_type="cash", payment_terms_days=0)
    updated = crud.update(db, customer.id, {"payment_terms_days": 15})
    assert updated.payment_terms_type == "cash"
    assert updated.payment_terms_days == 15


def test_code_lock_still_enforced_alongside_new_fields(db):
    customer = make_customer(db, code="CR-1")

    with pytest.raises(ValidationAppError):
        crud.update(db, customer.id, {"code": "CR-2", "trade_name": "New Trading Name"})


def test_code_can_be_completed_once_for_prospective_customer(db):
    customer = make_customer(db, code=None)
    updated = crud.update(db, customer.id, {"code": "CR-99"})
    assert updated.code == "CR-99"


def test_category_is_filterable(db):
    make_customer(db, category="VIP")
    make_customer(db, category="Regular")

    result = crud.read_all(db, page=1, page_size=10, filters={"category": "VIP"})
    assert len(result["items"]) == 1
    assert result["items"][0].category == "VIP"


def test_search_matches_contact_person_and_phone(db):
    make_customer(db, contact_person="Fahad Al-Rashid", phone="99991111")

    by_contact = crud.read_all(db, page=1, page_size=10, search="Fahad")
    assert len(by_contact["items"]) == 1

    by_phone = crud.read_all(db, page=1, page_size=10, search="99991111")
    assert len(by_phone["items"]) == 1


def test_new_optional_fields_persist(db):
    created = crud.create(
        db,
        {
            "customer_type": "business",
            "name": "Trading Co",
            "trade_name": "TradeCo",
            "alternate_phone": "1112223333",
            "alternate_email": "backup@example.com",
            "category": "Manufacturing",
            "payment_terms_type": "advance",
            "payment_terms_days": 0,
        },
    )
    assert created.trade_name == "TradeCo"
    assert created.alternate_phone == "1112223333"
    assert created.alternate_email == "backup@example.com"
    assert created.category == "Manufacturing"
    assert created.payment_terms_type == "advance"
