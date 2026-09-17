"""Page-level access control: a configurable department x page matrix a
super-admin governs from Master Data -> People & Organization -> Roles &
permissions.

Only 'admin' has an unconditional bypass -- full read/write everywhere,
never consulting this table (this is a governance tool for restricting
everyone else, not a way to accidentally lock out the person who
administers it). 'viewer' always has read-only access everywhere and
never consults it either, matching what the role name has always
implied. Every other role -- 'department_head', 'team_member', and the
legacy 'staff'/'manager' values (see app/models/user.py's role enum
comment) -- is governed by department_permissions, keyed on their own
department_id. A department/page combination with no row means 'none'
-- deny by default until explicitly granted. A user with no
department_id (including any not-yet-migrated legacy 'manager' row,
see migrations/2026-10-02_add_department_head_team_member_roles.sql)
therefore has no access anywhere until an admin assigns one.

This intentionally does NOT distinguish department_head from
team_member: both get whatever their department's page_key grants.
The difference between the two is enforced one layer down, at the
record level, for modules that have an ownership/assignment concept
(currently only Customers -- see app/crud/master_data.py CustomerCRUD.
_scope_query and app/api/customers.py): a department_head sees every
record their department's page access allows, a team_member sees only
records they created or are assigned to. Modules with no ownership
concept are department-wide for both, which is already what "full page
access" has always meant here.

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
    "supplier_returns",
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
    "supplier_returns": "Supplier Returns",
    "delivery_notes": "Delivery Notes",
    "deals": "Deals",
    "feasibilities": "Feasibilities",
    "machines": "Production Line",
    "quotations": "Quotations",
    "orders": "Orders",
    "production": "Production",
}

_LEVEL_RANK = {"none": 0, "read": 1, "write": 2}

assert set(PAGE_KEY_LABELS) == set(PAGE_KEYS), (
    "PAGE_KEY_LABELS and PAGE_KEYS have drifted apart -- every page_key needs exactly one label."
)


def is_admin(user: User) -> bool:
    return user.role == "admin"


def is_department_head(user: User) -> bool:
    return user.role == "department_head"


def is_team_member(user: User) -> bool:
    """True for the current 'team_member' role and its legacy synonym
    'staff' -- see app/models/user.py's role enum comment. A plain
    'staff' row already means exactly this (department-scoped, no
    global reach), so it's treated identically everywhere rather than
    requiring a data migration to rename it."""
    return user.role in ("team_member", "staff")


def same_department(user: User, department_id: int | None) -> bool:
    return department_id is not None and user.department_id == department_id


def can_access_owned_or_assigned_record(user: User, created_by: int | None, assigned_to: int | None) -> bool:
    """Reusable ownership check for a team_member-scoped record: theirs
    if they created it or it's currently assigned to them (see spec
    section 22's suggested helper names). Currently only Customers has
    either field -- see app/models/customer.py -- but this doesn't
    assume that; any future module that grows created_by/assigned_to
    can reuse it as-is."""
    return created_by is not None and user.id == created_by or assigned_to is not None and user.id == assigned_to


def has_page_access(user: User, db: Session, page_key: str, level: str = "read") -> bool:
    """The actual access rule, usable outside a FastAPI dependency chain
    (e.g. the search aggregator deciding which entities to even query
    for a given user). require_page_access below is a thin wrapper of
    this for route guards -- keep the rule itself in exactly one place.

    Deliberately the same check for department_head, team_member, and
    every legacy role value other than admin/viewer -- see this
    module's docstring for where the head/member distinction is
    actually enforced (one layer down, at the record level)."""
    assert page_key in PAGE_KEYS, f"Unknown page_key {page_key!r} -- add it to PAGE_KEYS first."
    assert level in ("read", "write")
    if is_admin(user):
        return True
    if user.role == "viewer":
        return level == "read"
    perm = (
        db.query(DepartmentPermission)
        .filter(
            DepartmentPermission.department_id == user.department_id,
            DepartmentPermission.page_key == page_key,
        )
        .first()
    )
    granted = _LEVEL_RANK[perm.access_level if perm else "none"]
    return granted >= _LEVEL_RANK[level]


def require_page_access(page_key: str, level: str = "read"):
    """FastAPI dependency factory. level is 'read' or 'write'."""
    assert page_key in PAGE_KEYS, f"Unknown page_key {page_key!r} -- add it to PAGE_KEYS first."
    assert level in ("read", "write")

    def _check(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if has_page_access(user, db, page_key, level):
            return user
        raise PermissionError_()

    return _check
