"""FeasibilityCreate now requires required_by_date -- without it,
run_check's production-line (capacity) stage never gets a real result
(see FeasibilityCreate's own docstring). Owner/status/submitted/due-date
visibility (FeasibilityOut.owner_name) is covered here too.
"""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.feasibility import FeasibilityCreate
from app.services import feasibility_service
from app.schemas.feasibility import FeasibilityOut

from .factories import make_customer, make_product, make_user


def test_required_by_date_is_mandatory(db):
    customer = make_customer(db)
    product = make_product(db)

    with pytest.raises(ValidationError):
        FeasibilityCreate(
            customer_id=customer.id,
            lines=[{"product_id": product.id, "quantity": 1}],
        )


def test_required_by_date_still_rejects_a_past_date(db):
    customer = make_customer(db)
    product = make_product(db)

    with pytest.raises(ValidationError):
        FeasibilityCreate(
            customer_id=customer.id,
            required_by_date=date(2000, 1, 1),
            lines=[{"product_id": product.id, "quantity": 1}],
        )


def test_a_future_required_by_date_is_accepted(db):
    customer = make_customer(db)
    product = make_product(db)

    payload = FeasibilityCreate(
        customer_id=customer.id,
        required_by_date=date.today() + timedelta(days=30),
        lines=[{"product_id": product.id, "quantity": 1}],
    )

    assert payload.required_by_date == date.today() + timedelta(days=30)


def test_feasibility_out_exposes_the_creating_user_as_owner(db):
    customer = make_customer(db)
    product = make_product(db)
    user = make_user(db, full_name="Fahad Al-Sabah")

    feasibility = feasibility_service.create_feasibility(
        db,
        {
            "customer_id": customer.id,
            "required_by_date": date.today() + timedelta(days=10),
            "lines": [{"product_id": product.id, "quantity": 1}],
        },
        user_id=user.id,
    )

    out = FeasibilityOut.from_model(feasibility)
    assert out.owner_name == "Fahad Al-Sabah"
