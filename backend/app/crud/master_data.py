from app.crud.base import BaseCRUD
from app.models.customer import Customer
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import User


class UserCRUD(BaseCRUD):
    model = User
    table_name = "users"
    searchable_fields = ["username", "email", "full_name"]
    sortable_fields = ["username", "full_name", "created_at"]
    filterable_fields = ["role", "status", "is_active"]


class CustomerCRUD(BaseCRUD):
    model = Customer
    table_name = "customers"
    searchable_fields = ["name", "code", "email"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status", "city", "country"]


class SupplierCRUD(BaseCRUD):
    model = Supplier
    table_name = "suppliers"
    searchable_fields = ["name", "code", "email"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status", "city", "country"]


class RawMaterialCRUD(BaseCRUD):
    model = RawMaterial
    table_name = "raw_materials"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status"]


class ProductCRUD(BaseCRUD):
    model = Product
    table_name = "products"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status", "product_type"]


user_crud = UserCRUD()
customer_crud = CustomerCRUD()
supplier_crud = SupplierCRUD()
raw_material_crud = RawMaterialCRUD()
product_crud = ProductCRUD()
