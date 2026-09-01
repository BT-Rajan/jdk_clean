"""Backs the command palette's global search box. One request here
replaces firing separate queries at every module's own list endpoint --
same underlying tables, same search semantics (plain `ilike`), just
aggregated and permission-filtered in one place instead of the
frontend guessing which endpoints it's allowed to call.

Every entity here is intentionally simple: a name/number column to
search, an id, a title, an optional subtitle, and the frontend route to
land on. Adding a new searchable entity is one line in SEARCHABLE.
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.core.permissions import has_page_access
from app.models.customer import Customer
from app.models.machine import Machine
from app.models.order import Order
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.models.quotation import Quotation
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import User


@dataclass(frozen=True)
class SearchableEntity:
    key: str
    label: str
    page_key: str
    model: Any
    search_columns: tuple
    title_column: str
    subtitle_column: str | None
    route_prefix: str  # frontend route, e.g. "/customers"


SEARCHABLE: tuple[SearchableEntity, ...] = (
    SearchableEntity("customers", "Customers", "customers", Customer,
                      (Customer.name, Customer.code), "name", "code", "/customers"),
    SearchableEntity("suppliers", "Suppliers", "suppliers", Supplier,
                      (Supplier.name, Supplier.code), "name", "code", "/suppliers"),
    SearchableEntity("products", "Products", "products", Product,
                      (Product.name, Product.code), "name", "code", "/products"),
    SearchableEntity("raw_materials", "Raw Materials", "raw_materials", RawMaterial,
                      (RawMaterial.name, RawMaterial.code), "name", "code", "/raw-materials"),
    SearchableEntity("machines", "Production Line", "machines", Machine,
                      (Machine.name, Machine.code), "name", "code", "/machines"),
    SearchableEntity("quotations", "Quotations", "quotations", Quotation,
                      (Quotation.quotation_number,), "quotation_number", "status", "/quotations"),
    SearchableEntity("orders", "Orders", "orders", Order,
                      (Order.order_number,), "order_number", "status", "/orders"),
    SearchableEntity("purchase_orders", "Purchase Orders", "purchase_orders", PurchaseOrder,
                      (PurchaseOrder.po_number,), "po_number", "status", "/purchase-orders"),
)


def search(db: Session, user: User, query: str, limit_per_entity: int = 5) -> list[dict]:
    q = query.strip()
    if len(q) < 2:
        return []
    like = f"%{q}%"

    results: list[dict] = []
    for entity in SEARCHABLE:
        if not has_page_access(user, db, entity.page_key, "read"):
            continue

        model = entity.model
        conditions = [cast(col, String).ilike(like) for col in entity.search_columns]
        query_obj = db.query(model).filter(or_(*conditions))
        if hasattr(model, "deleted_at"):
            query_obj = query_obj.filter(model.deleted_at.is_(None))
        rows = query_obj.order_by(model.id.desc()).limit(limit_per_entity).all()

        for row in rows:
            results.append({
                "entity": entity.key,
                "entity_label": entity.label,
                "id": row.id,
                "title": getattr(row, entity.title_column),
                "subtitle": getattr(row, entity.subtitle_column) if entity.subtitle_column else None,
                "url": f"{entity.route_prefix}/{row.id}",
            })

    return results
