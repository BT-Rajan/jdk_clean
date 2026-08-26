from app.api.common import build_crud_router
from app.crud.master_data import unit_of_measure_crud
from app.schemas.unit_of_measure import UnitOfMeasureCreate, UnitOfMeasureOut, UnitOfMeasureUpdate

# No page_key: falls back to build_crud_router's default guards, which
# is exactly the split wanted here -- read is any authenticated user
# (raw material and BOM forms both need this list to populate their unit
# dropdown, regardless of who's filling the form), write is admin-only
# (a factor_to_base edit silently reshapes every feasibility/MRP number
# that unit touches, so this is deliberately not on the department
# permission matrix like most master data -- same reasoning as BOM
# itself, see api/bom.py).
router = build_crud_router(
    crud=unit_of_measure_crud,
    create_schema=UnitOfMeasureCreate,
    update_schema=UnitOfMeasureUpdate,
    out_schema=UnitOfMeasureOut,
    prefix="/api/units",
    tags=["units"],
    write_roles=("admin",),
)
