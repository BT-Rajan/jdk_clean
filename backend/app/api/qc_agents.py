from app.api.common import build_crud_router
from app.crud.master_data import qc_agent_crud
from app.schemas.qc_agent import QcAgentCreate, QcAgentOut, QcAgentUpdate

# page_key="production" -- reuses the same department_permissions row
# that already governs the rest of this Production feature (P2-P6)
# rather than provisioning a brand new page key for what's a small,
# single-purpose master (see app/models/qc_agent.py).
router = build_crud_router(
    crud=qc_agent_crud,
    create_schema=QcAgentCreate,
    update_schema=QcAgentUpdate,
    out_schema=QcAgentOut,
    prefix="/api/qc-agents",
    tags=["production"],
    page_key="production",
)
