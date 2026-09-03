from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.assistant import router as assistant_router
from app.api.auth import router as auth_router
from app.api.bom import router as bom_router
from app.api.calendar import router as calendar_router
from app.api.communication import router as communication_router
from app.api.customers import router as customers_router
from app.api.dashboard import router as dashboard_router
from app.api.deals import router as deals_router
from app.api.departments import router as departments_router
from app.api.delivery_notes import router as delivery_notes_router
from app.api.doc_templates import router as doc_templates_router
from app.api.email_templates import router as email_templates_router
from app.api.feasibility import router as feasibility_router
from app.api.inventory import router as inventory_router
from app.api.machines import router as machines_router
from app.api.mrp import router as mrp_router
from app.api.notifications import router as notifications_router
from app.api.permissions import router as permissions_router
from app.api.orders import router as orders_router
from app.api.packaging import router as packaging_router
from app.api.payments import router as payments_router
from app.api.products import router as products_router
from app.api.production_schedules import router as production_schedules_router
from app.api.purchase_orders import router as purchase_orders_router
from app.api.quotations import router as quotations_router
from app.api.raw_materials import router as raw_materials_router
from app.api.search import router as search_router
from app.api.settings import router as settings_router
from app.api.suppliers import router as suppliers_router
from app.api.supplier_materials import router as supplier_materials_router
from app.api.supplier_returns import router as supplier_returns_router
from app.api.users import router as users_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.request_logging import install_request_logging

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging

    from app.core import scheduler
    from app.core.database import engine
    from app.core.migrations import apply_all

    # Applies any not-yet-run backend/migrations/*.sql before serving a
    # single request. Every migration here is idempotent, so this is a
    # no-op once a database is up to date -- but it closes the gap where
    # new code (referencing a new column/table) gets deployed ahead of
    # someone remembering to run scripts/run_migrations.py by hand,
    # which otherwise surfaces as a confusing 500 on whichever endpoint
    # happens to touch the missing column first, instead of failing
    # loudly at start-up where it's obvious what's wrong.
    migration_logger = logging.getLogger("app.startup.migrations")
    migration_logger.info("Checking for pending database migrations...")
    apply_all(
        engine,
        on_file=lambda name: migration_logger.info("Applying migration: %s", name),
        on_notice=lambda message: migration_logger.info("%s", message),
    )

    task = scheduler.start()
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logs every request in / response out to backend/logs/requests.log --
# see app/core/request_logging.py for exactly what's captured (never
# request bodies, so credentials never end up on disk). Meant to be
# left on; the file only grows with one or two short lines per request.
install_request_logging(app)

register_exception_handlers(app)
app.include_router(auth_router)
app.include_router(assistant_router)
app.include_router(users_router)
app.include_router(permissions_router)
app.include_router(settings_router)
app.include_router(customers_router)
app.include_router(dashboard_router)
app.include_router(deals_router)
app.include_router(departments_router)
app.include_router(suppliers_router)
app.include_router(supplier_materials_router)
app.include_router(raw_materials_router)
app.include_router(products_router)
app.include_router(machines_router)
app.include_router(inventory_router)
app.include_router(mrp_router)
app.include_router(notifications_router)
app.include_router(calendar_router)
app.include_router(communication_router)
app.include_router(feasibility_router)
app.include_router(quotations_router)
app.include_router(orders_router)
app.include_router(payments_router)
app.include_router(delivery_notes_router)
app.include_router(production_schedules_router)
app.include_router(purchase_orders_router)
app.include_router(supplier_returns_router)
app.include_router(email_templates_router)
app.include_router(doc_templates_router)
app.include_router(bom_router)
app.include_router(packaging_router)
app.include_router(search_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
