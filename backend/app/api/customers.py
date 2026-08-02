from app.api.common import build_crud_router
from app.crud.master_data import customer_crud
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate

router = build_crud_router(
    crud=customer_crud,
    create_schema=CustomerCreate,
    update_schema=CustomerUpdate,
    out_schema=CustomerOut,
    prefix="/api/customers",
    tags=["customers"],
    page_key="customers",
)
