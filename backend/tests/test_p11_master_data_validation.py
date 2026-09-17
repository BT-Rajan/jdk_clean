"""P11 -- master-data integrity: inactive/suspended master records must
not be usable to create a new transaction, server-side, regardless of
what the frontend allows through. Each test here fabricates the "was
active, now isn't" scenario the audit flagged and confirms the service
layer (not just the UI) rejects it.
"""

from datetime import date, timedelta

import pytest

from app.core.exceptions import ValidationAppError
from app.services import bom_service, order_service, production_service, purchase_order_service, quotation_service

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_machine,
    make_order,
    make_product,
    make_raw_material,
    make_supplier,
    set_stock,
)


def test_order_update_rejects_inactive_product_line(db):
    customer = make_customer(db)
    active_product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": active_product.id, "quantity": 5, "unit_price": 10}], status="draft"
    )
    inactive_product = make_product(db, status="inactive")

    with pytest.raises(ValidationAppError):
        order_service.update_order(
            db, order.id, {"lines": [{"product_id": inactive_product.id, "quantity": 5, "unit_price": 10}]}
        )


def test_quotation_creation_rejects_inactive_product(db):
    customer = make_customer(db)
    product = make_product(db, selling_price=10, status="inactive")

    with pytest.raises(ValidationAppError):
        quotation_service.create_quotation(
            db,
            {
                "customer_id": customer.id,
                "quotation_date": date(2026, 3, 10),
                "language": "en",
                "lines": [{"product_id": product.id, "quantity": 1, "unit_price": 10, "discount_percent": 0}],
            },
        )


def test_purchase_order_creation_rejects_inactive_raw_material(db):
    supplier = make_supplier(db)
    material = make_raw_material(db, status="inactive")

    with pytest.raises(ValidationAppError):
        purchase_order_service.create_purchase_order(
            db,
            {
                "supplier_id": supplier.id,
                "order_date": date(2026, 1, 1),
                "lines": [{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}],
            },
        )


def test_purchase_order_creation_rejects_inactive_supplier(db):
    supplier = make_supplier(db, status="inactive")
    material = make_raw_material(db)

    with pytest.raises(ValidationAppError):
        purchase_order_service.create_purchase_order(
            db,
            {
                "supplier_id": supplier.id,
                "order_date": date(2026, 1, 1),
                "lines": [{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}],
            },
        )


def test_purchase_order_creation_rejects_suspended_supplier(db):
    supplier = make_supplier(db, status="suspended")
    material = make_raw_material(db)

    with pytest.raises(ValidationAppError):
        purchase_order_service.create_purchase_order(
            db,
            {
                "supplier_id": supplier.id,
                "order_date": date(2026, 1, 1),
                "lines": [{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}],
            },
        )


def test_legacy_batch_creation_rejects_inactive_product(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1, status="inactive")
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)

    with pytest.raises(ValidationAppError):
        production_service.create_batch(
            db,
            {
                "product_id": product.id,
                "planned_quantity": 10,
                "scheduled_start": date.today() + timedelta(days=1),
                "scheduled_end": date.today() + timedelta(days=1),
                "machine_id": machine.id,
            },
        )


def test_legacy_batch_creation_rejects_inactive_machine(db):
    machine = make_machine(db, capacity_hours_per_day=800, status="inactive")
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)

    with pytest.raises(ValidationAppError):
        production_service.create_batch(
            db,
            {
                "product_id": product.id,
                "planned_quantity": 10,
                "scheduled_start": date.today() + timedelta(days=1),
                "scheduled_end": date.today() + timedelta(days=1),
                "machine_id": machine.id,
            },
        )


def test_bom_explosion_rejects_a_component_deactivated_after_the_bom_was_built(db):
    """The component was active when the BOM line was added (bom_service
    validates that at write time) -- deactivating it afterward must still
    be caught at the point of use (explode_requirements/_detailed), not
    silently produce a requirement for a phantom material."""
    product = make_product(db)
    material = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=2, scrap_percent=0)

    material.status = "inactive"
    db.flush()

    with pytest.raises(ValidationAppError):
        bom_service.explode_requirements(db, product.id, 10)
    with pytest.raises(ValidationAppError):
        bom_service.explode_requirements_detailed(db, product.id, 10)
