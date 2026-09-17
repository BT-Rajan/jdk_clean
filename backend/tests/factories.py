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
from app.models.delivery_note import DeliveryNote, DeliveryNoteLine
from app.models.department import Department
from app.models.department_permission import DepartmentPermission
from app.models.machine import Machine
from app.models.order import Order, OrderDetail
from app.models.product import Product
from app.models.product_packaging import ProductPackagingLine
from app.models.production_order import ProductionOrder
from app.models.production_schedule import ProductionSchedule
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.qc_agent import QcAgent
from app.models.raw_material import RawMaterial
from app.models.raw_material_alternative import RawMaterialAlternative
from app.models.inventory import FinishedGoodsInventory, RawMaterialInventory
from app.models.setting import Setting
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial
from app.models.user import User

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


def make_packaging_line(
    db: Session, product_id: int, packaging_material_id: int, quantity_per_unit: float, unit: str = "pcs"
) -> ProductPackagingLine:
    line = ProductPackagingLine(
        product_id=product_id,
        packaging_material_id=packaging_material_id,
        quantity_per_unit=quantity_per_unit,
        unit=unit,
    )
    db.add(line)
    db.flush()
    return line


def make_production_order(
    db: Session,
    order_id: int | None,
    order_detail_id: int | None,
    product_id: int,
    planned_quantity: float,
    due_date,
    **overrides,
) -> ProductionOrder:
    n = _n()
    po = ProductionOrder(
        production_order_number=overrides.pop("production_order_number", f"TESTPO-{n}"),
        order_id=order_id,
        order_detail_id=order_detail_id,
        product_id=product_id,
        planned_quantity=planned_quantity,
        due_date=due_date,
        **overrides,
    )
    db.add(po)
    db.flush()
    return po


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


def make_department(db: Session, **overrides) -> Department:
    n = _n()
    department = Department(
        code=overrides.pop("code", f"testdept{n}"),
        name=overrides.pop("name", f"Test Department {n}"),
        **overrides,
    )
    db.add(department)
    db.flush()
    return department


def make_user(db: Session, role: str = "team_member", **overrides) -> User:
    """Password hash is a fixed dummy value -- these tests never log in
    as the user, only exercise authorization logic that reads role/
    department_id directly, so a real bcrypt hash would be pure
    overhead."""
    n = _n()
    user = User(
        username=overrides.pop("username", f"testuser{n}"),
        email=overrides.pop("email", f"testuser{n}@example.test"),
        password_hash=overrides.pop("password_hash", "!"),
        full_name=overrides.pop("full_name", f"Test User {n}"),
        role=role,
        **overrides,
    )
    db.add(user)
    db.flush()
    return user


def grant_department_permission(db: Session, department_id: int, page_key: str, access_level: str = "write") -> DepartmentPermission:
    row = DepartmentPermission(department_id=department_id, page_key=page_key, access_level=access_level)
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


def set_product_stock(db: Session, product_id: int, quantity_on_hand: float, quantity_reserved: float = 0) -> FinishedGoodsInventory:
    """Finished-goods equivalent of set_stock -- test setup for "this
    order's product already has X on hand / Y reserved", bypassing
    order_service's own confirm-time reservation flow."""
    row = FinishedGoodsInventory(
        product_id=product_id,
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


def make_purchase_order(
    db: Session,
    supplier_id: int,
    lines: list[dict] | None = None,
    status: str = "draft",
    **overrides,
) -> PurchaseOrder:
    """lines: [{"raw_material_id", "quantity", "unit_price", optionally
    "received_quantity"}]. Defaults to one line of 10 units at 5.0 each
    against a freshly made raw material if none given."""
    n = _n()
    if lines is None:
        material = make_raw_material(db)
        lines = [{"raw_material_id": material.id, "quantity": 10, "unit_price": 5.0}]

    subtotal = sum(float(line["quantity"]) * float(line["unit_price"]) for line in lines)
    po = PurchaseOrder(
        po_number=overrides.pop("po_number", f"TESTPO-{n}"),
        supplier_id=supplier_id,
        order_date=overrides.pop("order_date", date(2026, 1, 1)),
        status=status,
        subtotal_amount=subtotal,
        total_amount=subtotal,
        **overrides,
    )
    db.add(po)
    db.flush()
    for line in lines:
        db.add(
            PurchaseOrderLine(
                purchase_order_id=po.id,
                raw_material_id=line["raw_material_id"],
                quantity=line["quantity"],
                unit_price=line["unit_price"],
                line_total=float(line["quantity"]) * float(line["unit_price"]),
                received_quantity=line.get("received_quantity", 0),
            )
        )
    db.flush()
    return po


def make_order(
    db: Session,
    customer_id: int,
    lines: list[dict] | None = None,
    status: str = "draft",
    **overrides,
) -> Order:
    """lines: [{"product_id", "quantity", "unit_price"}]. Defaults to one
    line of 10 units at 5.0 each against a freshly made product if none
    given."""
    n = _n()
    if lines is None:
        product = make_product(db)
        lines = [{"product_id": product.id, "quantity": 10, "unit_price": 5.0}]

    subtotal = sum(float(line["quantity"]) * float(line["unit_price"]) for line in lines)
    order = Order(
        order_number=overrides.pop("order_number", f"TESTORD-{n}"),
        customer_id=customer_id,
        order_date=overrides.pop("order_date", date(2026, 1, 1)),
        status=status,
        subtotal_amount=subtotal,
        total_amount=subtotal,
        **overrides,
    )
    db.add(order)
    db.flush()
    for line in lines:
        db.add(
            OrderDetail(
                order_id=order.id,
                product_id=line["product_id"],
                quantity=line["quantity"],
                unit_price=line["unit_price"],
                line_total=float(line["quantity"]) * float(line["unit_price"]),
            )
        )
    db.flush()
    return order


def make_delivery_note(
    db: Session,
    order_id: int,
    lines: list[dict] | None = None,
    status: str = "draft",
    **overrides,
) -> DeliveryNote:
    """lines: [{"product_id", "quantity_delivered"}]. Defaults to one line
    of 10 units against a freshly made product if none given."""
    n = _n()
    if lines is None:
        product = make_product(db)
        lines = [{"product_id": product.id, "quantity_delivered": 10}]

    note = DeliveryNote(
        delivery_note_number=overrides.pop("delivery_note_number", f"TESTDN-{n}"),
        order_id=order_id,
        delivery_date=overrides.pop("delivery_date", date(2026, 1, 1)),
        status=status,
        **overrides,
    )
    db.add(note)
    db.flush()
    for line in lines:
        db.add(
            DeliveryNoteLine(
                delivery_note_id=note.id,
                product_id=line["product_id"],
                quantity_delivered=line["quantity_delivered"],
            )
        )
    db.flush()
    return note


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


def make_qc_agent(db: Session, **overrides) -> QcAgent:
    n = _n()
    agent = QcAgent(
        code=overrides.pop("code", f"TESTQCA-{n}"),
        name=overrides.pop("name", f"Test QC Lab {n}"),
        **overrides,
    )
    db.add(agent)
    db.flush()
    return agent
