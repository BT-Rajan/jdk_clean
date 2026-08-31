"""Manages the department_permissions matrix that app.core.permissions
enforces. Only ever touched by admin/manager (see api/permissions.py's
guard) -- staff and viewer users are governed by this data, never
allowed to change it.

Departments come from the Department master (app/models/department.py),
not a hardcoded tuple -- the matrix always has one row per *active*
department times every page_key, so adding/deactivating a department
changes the grid without a code change here.
"""

from sqlalchemy.orm import Session

from app.core.permissions import PAGE_KEYS
from app.models.department import Department
from app.models.department_permission import DepartmentPermission
from app.services import audit_service


def _active_departments(db: Session) -> list[Department]:
    return (
        db.query(Department)
        .filter(Department.status == "active", Department.deleted_at.is_(None))
        .order_by(Department.code)
        .all()
    )


def get_matrix(db: Session) -> list[dict]:
    """Returns one row per (department, page_key) combination -- every
    active department times every page, always the full grid, with 'none'
    for anything that's never been explicitly set. This is what the
    Roles & Permissions checkbox grid renders directly, so it never has
    to guess which cells are 'unset' versus 'deliberately none'."""
    departments = _active_departments(db)
    existing = {(p.department_id, p.page_key): p.access_level for p in db.query(DepartmentPermission).all()}
    return [
        {
            "department_id": department.id,
            "department_code": department.code,
            "page_key": page_key,
            "access_level": existing.get((department.id, page_key), "none"),
        }
        for department in departments
        for page_key in PAGE_KEYS
    ]


def compute_effective_permissions(db: Session, user) -> dict[str, str]:
    """The calling user's own access_level per page -- what
    require_page_access actually enforces, exposed as data instead of a
    gate, so the frontend can decide what to show in nav/routing without
    needing admin rights to see the whole matrix. admin/manager get
    'write' on every page; viewer gets 'read' on every page; staff get
    whatever their department has been granted (or 'none', including
    when they have no department at all)."""
    if user.role in ("admin", "manager"):
        return dict.fromkeys(PAGE_KEYS, "write")
    if user.role == "viewer":
        return dict.fromkeys(PAGE_KEYS, "read")
    if user.department_id is None:
        return dict.fromkeys(PAGE_KEYS, "none")
    granted = {
        p.page_key: p.access_level
        for p in db.query(DepartmentPermission)
        .filter(DepartmentPermission.department_id == user.department_id)
        .all()
    }
    return {page_key: granted.get(page_key, "none") for page_key in PAGE_KEYS}


def set_matrix(db: Session, entries: list[dict], user_id: int | None = None) -> list[dict]:
    """Bulk upsert -- entries is a list of {department_id, page_key,
    access_level}, exactly the shape get_matrix returns, so the frontend
    can send the whole edited grid back in one call rather than one
    request per checkbox. Each real change (not every row -- most of a
    submitted grid is unchanged) is written to the shared audit log."""
    valid_department_ids = {d.id for d in _active_departments(db)}
    for entry in entries:
        department_id, page_key, access_level = entry["department_id"], entry["page_key"], entry["access_level"]
        if department_id not in valid_department_ids:
            continue
        if page_key not in PAGE_KEYS:
            continue
        if access_level not in ("none", "read", "write"):
            continue
        row = (
            db.query(DepartmentPermission)
            .filter(DepartmentPermission.department_id == department_id, DepartmentPermission.page_key == page_key)
            .first()
        )
        if row is None:
            row = DepartmentPermission(department_id=department_id, page_key=page_key, access_level="none")
            db.add(row)
            db.flush()
        if row.access_level != access_level:
            audit_service.log_update(
                db, "department_permissions", row.id, {"access_level": (row.access_level, access_level)}, user_id
            )
        row.access_level = access_level
        row.updated_by = user_id
    db.commit()
    return get_matrix(db)
