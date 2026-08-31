#!/usr/bin/env python3
"""Idempotent seed script for the JDK product formulas.

Seeds the 4 raw materials and 4 finished-good products from
"JDK Factory - Product Formula Summary" (Sand/Silica, Cement, RDP
Polymer, HPMC/Cellulose Ether -> K91, Mega, ECO, Block Bond), plus each
product's bill of materials, so they show up under Admin -> Factory
Setup and Admin -> Bill of Materials and immediately feed into
feasibility's raw-material check (bom_service.explode_requirements).

Batch size is 1,000 kg (1 ton) for every product per the source sheet.
BOM quantities are stored as the LITERAL kg amounts implied by each
percentage against that 1,000 kg batch -- NOT normalized to sum to
100%, per the sheet's own note that some formulas run slightly over
100% (polymer/HPMC are small additions on top of the sand/cement base):

    K91:        Sand 700kg, Cement 300kg, RDP  2kg, HPMC 6kg
    Mega:       Sand 600kg, Cement 400kg, RDP 10kg, HPMC 2kg
    ECO:        Sand 700kg, Cement 300kg, RDP  4kg, HPMC 2kg
    Block Bond: Sand 750kg, Cement 250kg, RDP  2kg, HPMC 1kg

Grout / K16 is deliberately NOT seeded here -- the source sheet marks
its sand/silica ratio "Not specified". Add it (and its BOM) once the
real formula is available; until then it simply shouldn't exist as a
half-correct product.

Packaging (20kg/50 bags, 25kg/40 bags, 5kg/200 bags per batch) is NOT
seeded here either -- the sheet gives the batch/packaging conversion
in general but doesn't say which bag size each product actually ships
in, so guessing a mapping would silently misinform packaging
calculations. Add ProductPackagingLine rows once that's confirmed.

Safe to re-run: skips anything that already exists (matched by code)
rather than overwriting it. Re-running after editing a formula in the
DB will NOT push your DB edits back to the sheet values -- it only
fills in what's missing.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/seed_jdk_formulas.py

Reads DB connection settings the same way the app does (backend/.env),
via app.core.config.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running as `python scripts/seed_jdk_formulas.py` from the
# backend/ dir without needing the package installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.models.bom import BomLine  # noqa: E402
from app.models.product import Product  # noqa: E402
from app.models.raw_material import RawMaterial  # noqa: E402

BATCH_SIZE_KG = 1000

# (code, name, unit)
RAW_MATERIALS = [
    ("RM-SAND", "Sand / Silica", "kg"),
    ("RM-CEMENT", "Cement", "kg"),
    ("RM-RDP", "RDP Polymer", "kg"),
    ("RM-HPMC", "HPMC / Cellulose Ether", "kg"),
]

# (code, name) -- batch_size/unit are set uniformly below
PRODUCTS = [
    ("PRD-K91", "K91"),
    ("PRD-MEGA", "Mega"),
    ("PRD-ECO", "ECO"),
    ("PRD-BLOCKBOND", "Block Bond"),
]

# product_code -> {raw_material_code: quantity_kg}, literal (unnormalized)
# kg amounts derived from each formula's percentage x 1,000kg batch.
FORMULAS: dict[str, dict[str, float]] = {
    "PRD-K91": {"RM-SAND": 700, "RM-CEMENT": 300, "RM-RDP": 2, "RM-HPMC": 6},
    "PRD-MEGA": {"RM-SAND": 600, "RM-CEMENT": 400, "RM-RDP": 10, "RM-HPMC": 2},
    "PRD-ECO": {"RM-SAND": 700, "RM-CEMENT": 300, "RM-RDP": 4, "RM-HPMC": 2},
    "PRD-BLOCKBOND": {"RM-SAND": 750, "RM-CEMENT": 250, "RM-RDP": 2, "RM-HPMC": 1},
}


def seed_raw_materials(db) -> dict[str, RawMaterial]:
    by_code: dict[str, RawMaterial] = {}
    for code, name, unit in RAW_MATERIALS:
        existing = db.query(RawMaterial).filter(RawMaterial.code == code).first()
        if existing:
            print(f"[skip] Raw material '{code}' already exists -- leaving it untouched.")
            by_code[code] = existing
            continue
        rm = RawMaterial(code=code, name=name, unit=unit, reorder_point=0, unit_cost=0, status="active")
        db.add(rm)
        db.flush()  # get rm.id without committing yet
        print(f"[ok]   Created raw material '{code}' ({name}).")
        by_code[code] = rm
    return by_code


def seed_products(db) -> dict[str, Product]:
    by_code: dict[str, Product] = {}
    for code, name in PRODUCTS:
        existing = db.query(Product).filter(Product.code == code).first()
        if existing:
            print(f"[skip] Product '{code}' already exists -- leaving it untouched.")
            by_code[code] = existing
            continue
        product = Product(
            code=code,
            name=name,
            unit="kg",
            product_type="finished_good",
            selling_price=0,
            batch_size=BATCH_SIZE_KG,
            status="active",
        )
        db.add(product)
        db.flush()
        print(f"[ok]   Created product '{code}' ({name}), batch_size={BATCH_SIZE_KG}kg.")
        by_code[code] = product
    return by_code


def seed_bom(db, products: dict[str, Product], raw_materials: dict[str, RawMaterial]) -> None:
    for product_code, formula in FORMULAS.items():
        product = products[product_code]
        existing_lines = (
            db.query(BomLine)
            .filter(BomLine.parent_product_id == product.id, BomLine.deleted_at.is_(None))
            .count()
        )
        if existing_lines:
            print(f"[skip] '{product_code}' already has {existing_lines} BOM line(s) -- leaving it untouched.")
            continue
        for rm_code, qty_kg in formula.items():
            rm = raw_materials[rm_code]
            db.add(
                BomLine(
                    parent_product_id=product.id,
                    component_type="raw_material",
                    component_id=rm.id,
                    quantity=qty_kg,
                    unit="kg",
                    scrap_percent=0,
                )
            )
        print(f"[ok]   Seeded BOM for '{product_code}' ({len(formula)} line(s)).")


def main() -> None:
    db = SessionLocal()
    try:
        raw_materials = seed_raw_materials(db)
        products = seed_products(db)
        seed_bom(db, products, raw_materials)
        db.commit()
        print("\nDone. Grout / K16 was skipped (formula not specified in the source sheet).")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
