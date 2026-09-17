from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.core.exceptions import ConflictError
from app.crud.master_data import department_crud
from app.models.department_permission import DepartmentPermission
from app.models.user import User
from app.schemas.department import DepartmentCreate, DepartmentOut, DepartmentUpdate


def _guard_department_in_use(db: Session, department_id: int) -> None:
    """Departments are the RBAC matrix's row axis and a field on every
    user -- deleting one out from under either would silently orphan
    references (a user with a department_id pointing nowhere, a matrix
    row for a department that no longer exists). Deactivate instead;
    this only blocks the hard delete, not the generic activate/deactivate
    lifecycle build_crud_router already gives every master."""
    in_use_by_users = (
        db.query(User).filter(User.department_id == department_id, User.deleted_at.is_(None)).first()
    )
    if in_use_by_users is not None:
        raise ConflictError("This department is assigned to at least one user. Reassign them first.")
    in_use_by_permissions = (
        db.query(DepartmentPermission).filter(DepartmentPermission.department_id == department_id).first()
    )
    if in_use_by_permissions is not None:
        raise ConflictError(
            "This department has entries in the Roles & Permissions matrix. Remove them first."
        )


# Admin-only, not department-permission-gated: departments define the
# very axis department_permissions is keyed on, so letting a
# department's own head/team manage the department list would be a
# privilege escalation path (see app/core/permissions.py -- Access
# Control is excluded from PAGE_KEYS for the same reason). Also where
# section 11's "only admin designates/changes a Department Head" is
# enforced -- see app/api/users.py's role/department validation, which
# is where a user actually becomes a given department's head.
router = build_crud_router(
    crud=department_crud,
    create_schema=DepartmentCreate,
    update_schema=DepartmentUpdate,
    out_schema=DepartmentOut,
    prefix="/api/departments",
    tags=["departments"],
    write_roles=("admin",),
    delete_guard=_guard_department_in_use,
)
