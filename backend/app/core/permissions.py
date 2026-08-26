"""Page-level access control, replacing the old hardcoded per-document-
type department guards (require_department_write in api/deps.py) with
a configurable matrix a super-admin governs from Settings -> Access
Control.

Only 'staff' users are governed by the department_permissions table --
admin and manager always have full read/write access everywhere and
never consult it (this is a governance tool for restricting staff, not
a way to accidentally lock out the people who administer it); 'viewer'
always has read-only access everywhere and never consults it either,
matching what the role name has always implied. A department/page
combination with no row in department_permissions means 'none' -- deny
by default until explicitly granted.

'read' access is required for GET/list endpoints; 'write' access
implies 'read' and is required for anything that creates, updates,
deletes, or transitions a resource's status.
"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import PermissionError_
from app.models.department_permission import DepartmentPermission
from app.models.user import User
from app.api.deps import get_current_user

# Every page the frontend actually routes to that isn't purely
# self-service (profile) or inherently admin-only regardless of this
# matrix (users, settings -- including this matrix itself, which would
# otherwise be a way for a staff user to grant themselves more access).
PAGE_KEYS = (
    "dashboard",
    "customers",
    "suppliers",
    "raw_materials",
    "products",
    "inventory",
    "mrp",
    "purchase_orders",
    "delivery_notes",
    "deals",
    "feasibilities",
    "machines",
    "quotations",
    "orders",
    "production",
)

# Single canonical label for each page_key -- the Access Control grid's
# column headers come from this (via /api/permissions/pages), not a
# second hardcoded copy on the frontend. Add a page here and the grid
# picks it up with no frontend change needed.
PAGE_KEY_LABELS: dict[str, str] = {
    "dashboard": "Dashboard",
    "customers": "Customers",
    "suppliers": "Suppliers",
    "raw_materials": "Raw Materials",
    "products": "Products",
    "inventory": "Inventory",
    "mrp": "MRP",
    "purchase_orders": "Purchase Orders",
    "delivery_notes": "Delivery Notes",
    "deals": "Deals",
    "feasibilities": "Feasibilities",
    "machines": "Machines",
    "quotations": "Quotations",
    "orders": "Orders",
    "production": "Production",
}

_LEVEL_RANK = {"none": 0, "read": 1, "write": 2}

assert set(PAGE_KEY_LABELS) == set(PAGE_KEYS), (
    "PAGE_KEY_LABELS and PAGE_KEYS have drifted apart -- every page_key needs exactly one label."
)


def require_page_access(page_key: str, level: str = "read"):
    """FastAPI dependency factory. level is 'read' or 'write'."""
    assert page_key in PAGE_KEYS, f"Unknown page_key {page_key!r} -- add it to PAGE_KEYS first."
    assert level in ("read", "write")

    def _check(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if user.role in ("admin", "manager"):
            return user
        if user.role == "viewer":
            if level == "read":
                return user
            raise PermissionError_()
        # staff
        perm = (
            db.query(DepartmentPermission)
            .filter(
                DepartmentPermission.department == user.department,
                DepartmentPermission.page_key == page_key,
            )
            .first()
        )
        granted = _LEVEL_RANK[perm.access_level if perm else "none"]
        needed = _LEVEL_RANK[level]
        if granted >= needed:
            return user
        raise PermissionError_()

    return _check
