from sqlalchemy.orm import Session

from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial
from app.services import bom_service


def get_suppliers_for_product(db: Session, product_id: int) -> dict:
    """Suppliers reachable from a product via its BOM: every raw material
    the BOM resolves to (recursing through sub-assemblies, same walk
    feasibility itself uses -- see bom_service.explode_requirements),
    each with its default supplier and every supplier able to provide it.

    Quantity is irrelevant here -- 1 is passed purely to reuse the BOM
    walk and get back the *set* of raw material ids touched, not an
    actual requirement figure.
    """
    raw_material_ids = list(bom_service.explode_requirements(db, product_id, 1).keys())
    if not raw_material_ids:
        return {"product_id": product_id, "materials": []}

    materials = (
        db.query(RawMaterial)
        .filter(RawMaterial.id.in_(raw_material_ids), RawMaterial.deleted_at.is_(None))
        .all()
    )
    links = (
        db.query(SupplierMaterial)
        .filter(SupplierMaterial.raw_material_id.in_(raw_material_ids), SupplierMaterial.deleted_at.is_(None))
        .all()
    )
    links_by_material: dict[int, list[SupplierMaterial]] = {}
    for link in links:
        links_by_material.setdefault(link.raw_material_id, []).append(link)

    default_supplier_ids = {m.default_supplier_id for m in materials if m.default_supplier_id}
    defaults = (
        {s.id: s for s in db.query(Supplier).filter(Supplier.id.in_(default_supplier_ids)).all()}
        if default_supplier_ids
        else {}
    )

    result = []
    for material in materials:
        default_supplier = defaults.get(material.default_supplier_id) if material.default_supplier_id else None
        suppliers = [
            {
                "supplier_id": link.supplier.id,
                "supplier_code": link.supplier.code,
                "supplier_name": link.supplier.name,
                "is_default": link.supplier_id == material.default_supplier_id,
                "max_supply_quantity": float(link.max_supply_quantity),
                "lead_time_days": link.lead_time_days,
            }
            for link in links_by_material.get(material.id, [])
        ]
        # A default supplier with no matching SupplierMaterial row (data
        # entered inconsistently) still shows up rather than being silently
        # dropped -- worth surfacing, not hiding.
        if default_supplier and not any(s["supplier_id"] == default_supplier.id for s in suppliers):
            suppliers.insert(
                0,
                {
                    "supplier_id": default_supplier.id,
                    "supplier_code": default_supplier.code,
                    "supplier_name": default_supplier.name,
                    "is_default": True,
                    "max_supply_quantity": None,
                    "lead_time_days": None,
                },
            )
        result.append(
            {
                "raw_material_id": material.id,
                "raw_material_code": material.code,
                "raw_material_name": material.name,
                "unit": material.unit,
                "suppliers": suppliers,
            }
        )

    result.sort(key=lambda r: r["raw_material_name"])
    return {"product_id": product_id, "materials": result}
