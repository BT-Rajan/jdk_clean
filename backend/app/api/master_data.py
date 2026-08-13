"""CRUD routers for the simple master-data resources.

Each of these used to be its own file (customers.py, machines.py,
products.py, raw_materials.py, suppliers.py) with the same three-line
shape: import a crud singleton + its three schemas, call
build_crud_router(...). Merged here into one module -- the config
per resource is unchanged, only the file layout.
"""

from app.api.common import build_crud_router
from app.crud.master_data import (
    customer_crud,
    machine_crud,
    product_crud,
    raw_material_crud,
    supplier_crud,
)
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.schemas.machine import MachineCreate, MachineOut, MachineUpdate
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate
from app.schemas.raw_material import RawMaterialCreate, RawMaterialOut, RawMaterialUpdate
from app.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate

customers_router = build_crud_router(
    crud=customer_crud,
    create_schema=CustomerCreate,
    update_schema=CustomerUpdate,
    out_schema=CustomerOut,
    prefix="/api/customers",
    tags=["customers"],
    page_key="customers",
)

machines_router = build_crud_router(
    crud=machine_crud,
    create_schema=MachineCreate,
    update_schema=MachineUpdate,
    out_schema=MachineOut,
    prefix="/api/machines",
    tags=["machines"],
    page_key="machines",
)

raw_materials_router = build_crud_router(
    crud=raw_material_crud,
    create_schema=RawMaterialCreate,
    update_schema=RawMaterialUpdate,
    out_schema=RawMaterialOut,
    prefix="/api/raw-materials",
    tags=["raw-materials"],
    page_key="raw_materials",
)

suppliers_router = build_crud_router(
    crud=supplier_crud,
    create_schema=SupplierCreate,
    update_schema=SupplierUpdate,
    out_schema=SupplierOut,
    prefix="/api/suppliers",
    tags=["suppliers"],
    page_key="suppliers",
)

products_router = build_crud_router(
    crud=product_crud,
    create_schema=ProductCreate,
    update_schema=ProductUpdate,
    out_schema=ProductOut,
    prefix="/api/products",
    tags=["products"],
    page_key="products",
)
