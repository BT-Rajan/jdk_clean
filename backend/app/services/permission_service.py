"""Manages the department_permissions matrix that app.core.permissions
enforces. Only ever touched by admin/manager (see api/permissions.py's
guard) -- staff and viewer users are governed by this data, never
allowed to change it.
"""

from sqlalchemy.orm import Session

from app.core.permissions import PAGE_KEYS
from app.models.department_permission import DepartmentPermission

DEPARTMENTS = ("sales", "procurement", "warehouse")


def get_matrix(db: Session) -> list[dict]:
    """Returns one row per (department, page_key) combination -- every
    department times every page, always the full grid, with 'none' for
    anything that's never been explicitly set. This is what the
    Settings -> Access Control checkbox grid renders directly, so it
    never has to guess which cells are 'unset' versus 'deliberately
    none'."""
    existing = {(p.department, p.page_key): p.access_level for p in db.query(DepartmentPermission).all()}
    return [
        {
            "department": department,
            "page_key": page_key,
            "access_level": existing.get((department, page_key), "none"),
        }
        for department in DEPARTMENTS
        for page_key in PAGE_KEYS
    ]


def compute_effective_permissions(db: Session, user) -> dict[str, str]:
    """The calling user's own access_level per page -- what
    require_page_access actually enforces, exposed as data instead of a
    gate, so the frontend can decide what to show in nav/routing without
    needing admin rights to see the whole matrix. admin/manager get
    'write' on every page; viewer gets 'read' on every page; staff get
    whatever their department has been granted (or 'none')."""
    if user.role in ("admin", "manager"):
        return dict.fromkeys(PAGE_KEYS, "write")
    if user.role == "viewer":
        return dict.fromkeys(PAGE_KEYS, "read")
    granted = {
        p.page_key: p.access_level
        for p in db.query(DepartmentPermission).filter(DepartmentPermission.department == user.department).all()
    }
    return {page_key: granted.get(page_key, "none") for page_key in PAGE_KEYS}


def set_matrix(db: Session, entries: list[dict], user_id: int | None = None) -> list[dict]:
    """Bulk upsert -- entries is a list of {department, page_key,
    access_level}, exactly the shape get_matrix returns, so the
    frontend can send the whole edited grid back in one call rather
    than one request per checkbox."""
    for entry in entries:
        department, page_key, access_level = entry["department"], entry["page_key"], entry["access_level"]
        if department not in DEPARTMENTS:
            continue
        if page_key not in PAGE_KEYS:
            continue
        if access_level not in ("none", "read", "write"):
            continue
        row = (
            db.query(DepartmentPermission)
            .filter(DepartmentPermission.department == department, DepartmentPermission.page_key == page_key)
            .first()
        )
        if row is None:
            row = DepartmentPermission(department=department, page_key=page_key)
            db.add(row)
        row.access_level = access_level
        row.updated_by = user_id
    db.commit()
    return get_matrix(db)
