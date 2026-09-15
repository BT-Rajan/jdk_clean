"""Minimum-valid-row factories for the models these tests need.

Each factory takes a `db` session, creates one row via the ORM model
directly (not the service/CRUD layer -- test setup shouldn't depend on
validation rules that belong to a *different* feature than the one being
tested), flushes it so it has an id, and returns it. A counter-based
unique suffix means a test can call e.g. make_raw_material() as many
times as it needs without colliding on the unique `code` column, without
tests needing to invent their own unique names.
"""

from datetime import date
from itertools import count

from sqlalchemy.orm import Session

from app.models.bom import Bom, BomLine
from app.models.customer import Customer
from app.models.machine import Machine
from app.models.product import Product
from app.models.production_schedule import ProductionSchedule
from app.models.raw_material import RawMaterial
from app.models.raw_material_alternative import RawMaterialAlternative
from app.models.inventory import RawMaterialInventory
from app.models.setting import Setting
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial

_seq = count(1)


def _n() -> int:
    return next(_seq)


def make_raw_material(db: Session, **overrides) -> RawMaterial:
    n = _n()
    material = RawMaterial(
        code=overrides.pop("code", f"TESTMAT-{n}"),
        name=overrides.pop("name", f"Test Material {n}"),
        unit=overrides.pop("unit", "kg"),
        **overrides,
    )
    db.add(material)
    db.flush()
    return material


def make_product(db: Session, **overrides) -> Product:
    n = _n()
    product = Product(
        code=overrides.pop("code", f"TESTPROD-{n}"),
        name=overrides.pop("name", f"Test Product {n}"),
        unit=overrides.pop("unit", "kg"),
        **overrides,
    )
    db.add(product)
    db.flush()
    return product


def make_bom(db: Session, product_id: int, output_quantity: float = 1, status: str = "active", **overrides) -> Bom:
    n = _n()
    bom = Bom(
        bom_number=overrides.pop("bom_number", f"TESTBOM-{n}"),
        product_id=product_id,
        output_quantity=output_quantity,
        status=status,
        **overrides,
    )
    db.add(bom)
    db.flush()
    return bom


def make_bom_line(
    db: Session,
    parent_product_id: int,
    component_type: str,
    component_id: int,
    quantity: float,
    unit: str = "kg",
    scrap_percent: float = 0,
) -> BomLine:
    line = BomLine(
        parent_product_id=parent_product_id,
        component_type=component_type,
        component_id=component_id,
        quantity=quantity,
        unit=unit,
        scrap_percent=scrap_percent,
    )
    db.add(line)
    db.flush()
    return line


def make_machine(db: Session, capacity_hours_per_day: float = 8, **overrides) -> Machine:
    n = _n()
    machine = Machine(
        code=overrides.pop("code", f"TESTMC-{n}"),
        name=overrides.pop("name", f"Test Machine {n}"),
        capacity_hours_per_day=capacity_hours_per_day,
        **overrides,
    )
    db.add(machine)
    db.flush()
    return machine


def make_supplier(db: Session, **overrides) -> Supplier:
    n = _n()
    supplier = Supplier(
        code=overrides.pop("code", f"TESTSUP-{n}"),
        name=overrides.pop("name", f"Test Supplier {n}"),
        **overrides,
    )
    db.add(supplier)
    db.flush()
    return supplier


def make_supplier_material(
    db: Session,
    supplier_id: int,
    raw_material_id: int,
    lead_time_days: int | None,
    max_supply_quantity: float,
    **overrides,
) -> SupplierMaterial:
    row = SupplierMaterial(
        supplier_id=supplier_id,
        raw_material_id=raw_material_id,
        lead_time_days=lead_time_days,
        max_supply_quantity=max_supply_quantity,
        onboarded_at=overrides.pop("onboarded_at", date(2026, 1, 1)),
        **overrides,
    )
    db.add(row)
    db.flush()
    return row


def make_alternative(
    db: Session,
    raw_material_id: int,
    alternative_material_id: int,
    status: str = "approved",
    priority: int = 1,
    conversion_ratio: float = 1,
) -> RawMaterialAlternative:
    row = RawMaterialAlternative(
        raw_material_id=raw_material_id,
        alternative_material_id=alternative_material_id,
        status=status,
        priority=priority,
        conversion_ratio=conversion_ratio,
    )
    db.add(row)
    db.flush()
    return row


def make_customer(db: Session, **overrides) -> Customer:
    n = _n()
    customer = Customer(
        customer_number=overrides.pop("customer_number", f"TESTCUST-{n}"),
        name=overrides.pop("name", f"Test Customer {n}"),
        **overrides,
    )
    db.add(customer)
    db.flush()
    return customer


def set_stock(db: Session, raw_material_id: int, quantity_on_hand: float, quantity_reserved: float = 0) -> RawMaterialInventory:
    """Seeds a raw material's on-hand stock directly, bypassing
    inventory_service.adjust_stock's receipt-detail requirements -- test
    setup for "this material currently has X in stock", not a receiving
    transaction being tested in its own right (see
    test_inventory_safety.py for that)."""
    row = RawMaterialInventory(
        raw_material_id=raw_material_id,
        quantity_on_hand=quantity_on_hand,
        quantity_reserved=quantity_reserved,
    )
    db.add(row)
    db.flush()
    return row


def set_factory_labor_pool(db: Session, total_workers: int, workday_hours: float = 8) -> None:
    """Seeds the two settings rows settings_service.get_factory_labor_pool
    reads -- unset, the worker-capacity side of the capacity check is
    simply skipped (see that function's docstring), so this is only
    needed for tests that specifically exercise the worker constraint."""
    db.add(Setting(setting_key="factory_total_workers", setting_value=str(total_workers)))
    db.add(Setting(setting_key="factory_workday_hours", setting_value=str(workday_hours)))
    db.flush()


def make_production_schedule(db: Session, product_id: int, planned_quantity: float, scheduled_start, scheduled_end, machine_id: int | None = None, status: str = "planned", **overrides) -> ProductionSchedule:
    """A booked (default status='planned', i.e. counted by capacity_
    service.BOOKED_PRODUCTION_STATUSES) production batch occupying
    machine/worker time -- test setup for "capacity is already spoken
    for on these days", not production_service's own booking logic
    (which test_production_readiness.py exercises directly)."""
    n = _n()
    batch = ProductionSchedule(
        batch_number=overrides.pop("batch_number", f"TESTBATCH-{n}"),
        product_id=product_id,
        machine_id=machine_id,
        planned_quantity=planned_quantity,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        status=status,
        **overrides,
    )
    db.add(batch)
    db.flush()
    return batch
