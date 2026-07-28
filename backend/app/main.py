from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.customers import router as customers_router
from app.api.inventory import router as inventory_router
from app.api.bom import router as bom_router
from app.api.orders import router as orders_router
from app.api.products import router as products_router
from app.api.quotations import router as quotations_router
from app.api.raw_materials import router as raw_materials_router
from app.api.suppliers import router as suppliers_router
from app.api.supplier_materials import router as supplier_materials_router
from app.api.users import router as users_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers

settings = get_settings()

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(customers_router)
app.include_router(suppliers_router)
app.include_router(supplier_materials_router)
app.include_router(raw_materials_router)
app.include_router(products_router)
app.include_router(inventory_router)
app.include_router(quotations_router)
app.include_router(orders_router)
app.include_router(bom_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
