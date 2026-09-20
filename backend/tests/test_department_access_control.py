"""Department-based access control hardening pass: the role +
department + ownership model that replaces the old "manager = global
write access" shape.

Covers the two layers app/core/permissions.py's module docstring
describes: page-level access (has_page_access, admin/viewer/everyone-
else-via-the-matrix) and, for Customers specifically, the record-level
ownership split between department_head (full department access) and
team_member (created_by/assigned_to only) -- spec section 6, the
flagship "Sales Head sees everyone, a salesman sees only their own/
assigned" rule. Also covers the UserCRUD guardrails added alongside
this pass: department_head/team_member require a department, and only
one active department_head per department.
"""

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.core.permissions import can_access_owned_or_assigned_record, has_page_access
from app.crud.master_data import CustomerCRUD, UserCRUD

from .factories import grant_department_permission, make_customer, make_department, make_user

customer_crud = CustomerCRUD()
user_crud = UserCRUD()


# ---------------------------------------------------------------------
# has_page_access -- page-level checks
# ---------------------------------------------------------------------

def test_admin_bypasses_the_matrix_entirely(db):
    admin = make_user(db, role="admin", department_id=None)
    assert has_page_access(admin, db, "customers", "write") is True


def test_viewer_is_read_only_everywhere_without_a_department(db):
    viewer = make_user(db, role="viewer", department_id=None)
    assert has_page_access(viewer, db, "customers", "read") is True
    assert has_page_access(viewer, db, "customers", "write") is False


def test_department_head_follows_the_departments_matrix(db):
    dept = make_department(db)
    grant_department_permission(db, dept.id, "customers", "write")
    head = make_user(db, role="department_head", department_id=dept.id)
    assert has_page_access(head, db, "customers", "write") is True
    # A different, ungranted page for the same department is still denied.
    assert has_page_access(head, db, "suppliers", "read") is False


def test_team_member_follows_the_departments_matrix(db):
    dept = make_department(db)
    grant_department_permission(db, dept.id, "customers", "read")
    member = make_user(db, role="team_member", department_id=dept.id)
    assert has_page_access(member, db, "customers", "read") is True
    assert has_page_access(member, db, "customers", "write") is False


def test_legacy_staff_role_is_treated_identically_to_team_member(db):
    dept = make_department(db)
    grant_department_permission(db, dept.id, "customers", "write")
    staff = make_user(db, role="staff", department_id=dept.id)
    assert has_page_access(staff, db, "customers", "write") is True


def test_user_with_no_department_has_no_access_regardless_of_role(db):
    # This is the exact state an unresolved legacy 'manager' row is left
    # in by migrations/2026-10-02_add_department_head_team_member_roles.sql
    # -- no guessed department, and (unlike before this pass) no more
    # free global access either.
    unresolved_manager = make_user(db, role="manager", department_id=None)
    assert has_page_access(unresolved_manager, db, "customers", "read") is False
    assert has_page_access(unresolved_manager, db, "customers", "write") is False


def test_cross_department_access_is_denied(db):
    sales = make_department(db, code="salestest")
    purchase = make_department(db, code="purchasetest")
    grant_department_permission(db, sales.id, "customers", "write")
    purchase_head = make_user(db, role="department_head", department_id=purchase.id)
    assert has_page_access(purchase_head, db, "customers", "read") is False


# ---------------------------------------------------------------------
# Customer ownership scoping (spec section 6/8) -- the flagship rule
# ---------------------------------------------------------------------

def test_admin_sees_every_customer_regardless_of_creator(db):
    salesman_a = make_user(db, role="team_member")
    salesman_b = make_user(db, role="team_member")
    make_customer(db, created_by=salesman_a.id)
    make_customer(db, created_by=salesman_b.id)
    admin = make_user(db, role="admin")

    result = customer_crud.read_all(db, user=admin)
    assert result["total"] >= 2


def test_department_head_sees_every_customer_unfiltered(db):
    dept = make_department(db)
    head = make_user(db, role="department_head", department_id=dept.id)
    salesman_a = make_user(db, role="team_member", department_id=dept.id)
    salesman_b = make_user(db, role="team_member", department_id=dept.id)
    make_customer(db, created_by=salesman_a.id)
    make_customer(db, created_by=salesman_b.id)

    result = customer_crud.read_all(db, user=head)
    ids = {c.id for c in result["items"]}
    assert len(ids) >= 2  # both salesmen's customers, none excluded by ownership


def test_team_member_sees_only_assigned_customers(db):
    """Ownership is assigned_to only (Sales spec section 2). created_by is
    history: a customer a salesman created but that is assigned to
    someone else is NOT theirs."""
    dept = make_department(db)
    salesman_a = make_user(db, role="team_member", department_id=dept.id)
    salesman_b = make_user(db, role="team_member", department_id=dept.id)

    assigned_to_a = make_customer(db, name="Assigned to A", created_by=None, assigned_to=salesman_a.id)
    assigned_to_b = make_customer(db, name="Assigned to B", created_by=None, assigned_to=salesman_b.id)
    created_by_a_but_b_owns = make_customer(
        db, name="Created by A, assigned to B", created_by=salesman_a.id, assigned_to=salesman_b.id
    )
    created_by_a_unassigned = make_customer(db, name="Created by A, unassigned", created_by=salesman_a.id)

    result = customer_crud.read_all(db, user=salesman_a)
    visible_ids = {c.id for c in result["items"]}

    assert assigned_to_a.id in visible_ids
    assert assigned_to_b.id not in visible_ids
    assert created_by_a_but_b_owns.id not in visible_ids  # creating it is not owning it
    assert created_by_a_unassigned.id not in visible_ids  # unassigned belongs to nobody yet


def test_reassignment_moves_visibility_to_the_new_assignee(db):
    """Customer A is assigned to Salesman A; the Sales Manager reassigns it
    to Salesman B: B gains access, A LOSES it, the manager keeps it."""
    dept = make_department(db)
    salesman_a = make_user(db, role="team_member", department_id=dept.id)
    salesman_b = make_user(db, role="team_member", department_id=dept.id)
    head = make_user(db, role="department_head", department_id=dept.id)
    customer = make_customer(db, created_by=salesman_a.id, assigned_to=salesman_a.id)

    def sees(user):
        return customer.id in {c.id for c in customer_crud.read_all(db, user=user)["items"]}

    assert sees(salesman_a) and not sees(salesman_b) and sees(head)

    customer_crud.update(db, customer.id, {"assigned_to": salesman_b.id})

    assert sees(salesman_b)
    assert not sees(salesman_a)  # the previous salesman loses access, even as creator
    assert sees(head)  # the manager retains it
    assert customer_crud.read_one(db, customer.id).created_by == salesman_a.id  # created_by never changes


def test_salesman_cannot_read_a_customer_by_direct_id_outside_their_scope(db):
    """Spec section 8: 'A salesman must not bypass list filtering by
    requesting GET /customers/{id} directly.' -- read_one must apply the
    same scoping as read_all, not just the list endpoint."""
    dept = make_department(db)
    salesman_a = make_user(db, role="team_member", department_id=dept.id)
    salesman_b = make_user(db, role="team_member", department_id=dept.id)
    customer = make_customer(db, created_by=salesman_b.id, assigned_to=salesman_b.id)

    from app.core.exceptions import NotFoundError

    with pytest.raises(NotFoundError):
        customer_crud.read_one(db, customer.id, user=salesman_a)

    # B, the assignee, can still read it directly.
    assert customer_crud.read_one(db, customer.id, user=salesman_b).id == customer.id


def test_a_salesmans_new_customer_is_assigned_to_them(db):
    """Ownership is assigned_to only, so create() must auto-assign -- else a
    salesman's own new customer would vanish from their list."""
    dept = make_department(db)
    salesman = make_user(db, role="team_member", department_id=dept.id)
    head = make_user(db, role="department_head", department_id=dept.id)

    mine = customer_crud.create(db, {"customer_type": "business", "name": "Made by salesman", "payment_terms_type": "cash"}, user_id=salesman.id)
    theirs = customer_crud.create(db, {"customer_type": "business", "name": "Made by manager", "payment_terms_type": "cash"}, user_id=head.id)

    assert mine.assigned_to == salesman.id
    assert mine.id in {c.id for c in customer_crud.read_all(db, user=salesman)["items"]}
    assert theirs.assigned_to is None  # the manager hands these out
    assert theirs.id not in {c.id for c in customer_crud.read_all(db, user=salesman)["items"]}


def test_search_inherits_ownership_scoping(db):
    """No dedicated autocomplete endpoint exists (per the audit) -- the
    `search` param on the list endpoint doubles as it, so it must
    inherit the same scoping, not just the unfiltered list."""
    dept = make_department(db)
    salesman_a = make_user(db, role="team_member", department_id=dept.id)
    salesman_b = make_user(db, role="team_member", department_id=dept.id)
    make_customer(db, name="Acme Corp", created_by=salesman_b.id, assigned_to=salesman_b.id)

    result = customer_crud.read_all(db, search="Acme", user=salesman_a)
    assert result["total"] == 0


def test_can_access_owned_or_assigned_record_helper(db):
    salesman = make_user(db, role="team_member")
    other = make_user(db, role="team_member")
    assert can_access_owned_or_assigned_record(salesman, created_by=salesman.id, assigned_to=None) is True
    assert can_access_owned_or_assigned_record(salesman, created_by=None, assigned_to=salesman.id) is True
    assert can_access_owned_or_assigned_record(salesman, created_by=other.id, assigned_to=other.id) is False


# ---------------------------------------------------------------------
# UserCRUD guardrails: department required, one head per department
# ---------------------------------------------------------------------

def test_department_head_requires_a_department(db):
    with pytest.raises(ValidationAppError):
        user_crud.create(
            db,
            {
                "username": "head_no_dept",
                "email": "head_no_dept@example.test",
                "password_hash": "!",
                "full_name": "Head No Dept",
                "role": "department_head",
                "department_id": None,
            },
        )


def test_team_member_requires_a_department(db):
    with pytest.raises(ValidationAppError):
        user_crud.create(
            db,
            {
                "username": "member_no_dept",
                "email": "member_no_dept@example.test",
                "password_hash": "!",
                "full_name": "Member No Dept",
                "role": "team_member",
                "department_id": None,
            },
        )


def test_admin_does_not_require_a_department(db):
    admin = user_crud.create(
        db,
        {
            "username": "admin_no_dept",
            "email": "admin_no_dept@example.test",
            "password_hash": "!",
            "full_name": "Admin No Dept",
            "role": "admin",
            "department_id": None,
        },
    )
    assert admin.department_id is None


def test_second_active_department_head_is_rejected(db):
    dept = make_department(db)
    make_user(db, role="department_head", department_id=dept.id)

    with pytest.raises(ConflictError):
        user_crud.create(
            db,
            {
                "username": "second_head",
                "email": "second_head@example.test",
                "password_hash": "!",
                "full_name": "Second Head",
                "role": "department_head",
                "department_id": dept.id,
            },
        )


def test_deactivated_head_frees_up_the_department_for_a_new_head(db):
    dept = make_department(db)
    first_head = make_user(db, role="department_head", department_id=dept.id)
    user_crud.update(db, first_head.id, {"is_active": False})

    replacement = user_crud.create(
        db,
        {
            "username": "replacement_head",
            "email": "replacement_head@example.test",
            "password_hash": "!",
            "full_name": "Replacement Head",
            "role": "department_head",
            "department_id": dept.id,
        },
    )
    assert replacement.department_id == dept.id


def test_updating_the_same_head_does_not_conflict_with_themselves(db):
    dept = make_department(db)
    head = make_user(db, role="department_head", department_id=dept.id)
    # Re-saving an unrelated field on the same head must not trip the
    # "second head" check against their own existing row.
    updated = user_crud.update(db, head.id, {"full_name": "Renamed Head"})
    assert updated.full_name == "Renamed Head"


def test_moving_a_team_member_to_a_new_department_is_allowed(db):
    dept_a = make_department(db)
    dept_b = make_department(db)
    member = make_user(db, role="team_member", department_id=dept_a.id)
    updated = user_crud.update(db, member.id, {"department_id": dept_b.id})
    assert updated.department_id == dept_b.id
