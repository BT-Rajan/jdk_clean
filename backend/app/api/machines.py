from app.api.common import build_crud_router
from app.crud.master_data import machine_crud
from app.schemas.machine import MachineCreate, MachineOut, MachineUpdate

router = build_crud_router(
    crud=machine_crud,
    create_schema=MachineCreate,
    update_schema=MachineUpdate,
    out_schema=MachineOut,
    prefix="/api/machines",
    tags=["machines"],
)
