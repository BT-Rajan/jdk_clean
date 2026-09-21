from fastapi import Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.api.deps import require_role
from app.core.database import get_db
from app.core.exceptions import NotFoundError, PermissionError_, ValidationAppError
from app.core.permissions import is_admin, is_department_head, require_page_access
from app.crud.master_data import customer_crud
from app.models.user import User
from app.schemas.customer import (
    CustomerAssignUpdate,
    CustomerCreate,
    CustomerOnboardingStatusUpdate,
    CustomerOut,
    CustomerUpdate,
)
from app.schemas.payment import CustomerCreditStatusOut
from app.services import avatar_service, customer_service, id_document_service, payment_service

read_guard = require_page_access("customers", "read")
write_guard = require_page_access("customers", "write")
# Creating a new customer stays open to whoever normally has customers
# write access (e.g. Sales onboarding a new client); editing, deleting,
# restoring, or activating/deactivating an existing one is admin-only.
admin_guard = require_role("admin")

ID_DOCUMENT_SUBDIR = "customer_ids"
AVATAR_SUBDIR = "customer_avatars"
TABLE_NAME = "customers"

router = build_crud_router(
    crud=customer_crud,
    create_schema=CustomerCreate,
    update_schema=CustomerUpdate,
    out_schema=CustomerOut,
    prefix="/api/customers",
    tags=["customers"],
    page_key="customers",
    strict_write_guard=admin_guard,
)


@router.get("/{customer_id}/credit", response_model=CustomerCreditStatusOut)
def get_customer_credit(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    """Credit limit, current outstanding balance (unpaid non-draft/
    non-cancelled orders), and what's left before order_service.
    change_status starts refusing to confirm a new order for this
    customer without admin approval."""
    customer_crud.read_one(db, customer_id, user=user)  # 404s if out of scope
    return payment_service.get_customer_credit_status(db, customer_id)


@router.post("/{customer_id}/onboarding-status", response_model=CustomerOut)
def update_customer_onboarding_status(
    customer_id: int,
    payload: CustomerOnboardingStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer_crud.read_one(db, customer_id, user=user)  # 404s if out of scope
    return customer_service.change_onboarding_status(
        db, customer_id, payload.status, payload.reason, user.id
    )


@router.post("/{customer_id}/id-document", response_model=CustomerOut)
async def upload_customer_id_document(
    customer_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id, user=user)
    raw_bytes = await file.read()
    return id_document_service.save_document(
        db, customer, raw_bytes, subdir=ID_DOCUMENT_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )


@router.delete("/{customer_id}/id-document", response_model=CustomerOut)
def delete_customer_id_document(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id, user=user)
    return id_document_service.delete_document(
        db, customer, subdir=ID_DOCUMENT_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )


@router.get("/{customer_id}/id-document")
def get_customer_id_document(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    customer = customer_crud.read_one(db, customer_id, user=user)
    found = id_document_service.get_document_file(customer, subdir=ID_DOCUMENT_SUBDIR)
    if found is None:
        raise NotFoundError("Id document")
    path, media_type = found
    return FileResponse(path, media_type=media_type)


@router.post("/{customer_id}/verify-id", response_model=CustomerOut)
def verify_customer_id(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Also auto-advances onboarding_status where that's a legal single
    step -- see customer_service.verify_id."""
    customer_crud.read_one(db, customer_id, user=user)  # 404s if out of scope
    return customer_service.verify_id(db, customer_id, user.id)


@router.post("/{customer_id}/unverify-id", response_model=CustomerOut)
def unverify_customer_id(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id, user=user)
    return id_document_service.unverify(db, customer, table_name=TABLE_NAME, user_id=user.id)


@router.post("/{customer_id}/avatar", response_model=CustomerOut)
async def upload_customer_avatar(
    customer_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id, user=user)
    raw_bytes = await file.read()
    return avatar_service.save_avatar(
        db, customer, raw_bytes, subdir=AVATAR_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )


@router.delete("/{customer_id}/avatar", response_model=CustomerOut)
def delete_customer_avatar(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id, user=user)
    return avatar_service.delete_avatar(db, customer, subdir=AVATAR_SUBDIR, table_name=TABLE_NAME, user_id=user.id)


@router.get("/{customer_id}/avatar")
def get_customer_avatar(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    customer = customer_crud.read_one(db, customer_id, user=user)
    path = avatar_service.get_avatar_path(customer, subdir=AVATAR_SUBDIR)
    if path is None:
        raise NotFoundError("Avatar")
    return FileResponse(path, media_type="image/jpeg")


def _require_can_assign(db: Session = Depends(get_db), user: User = Depends(write_guard)) -> User:
    """Assigning/reassigning a customer is a Sales Head (or admin)
    action -- spec section 7: "Sales Team Member must NOT be able to
    assign/reassign customers to another salesperson." write_guard
    above already confirms page-level customers:write for the caller's
    department; this on top of it excludes team_member specifically."""
    if not (is_admin(user) or is_department_head(user)):
        raise PermissionError_()
    return user


@router.post("/{customer_id}/assign", response_model=CustomerOut)
def assign_customer(
    customer_id: int,
    payload: CustomerAssignUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_require_can_assign),
):
    """Sets who currently owns the operational relationship with this
    customer -- distinct from created_by, which never changes (spec
    section 18). assigned_to may be null to unassign. Recorded in the
    same audit_log every other field edit on this table goes through
    (crud.base.BaseCRUD.update), satisfying section 7's "assignment
    must be auditable" -- current assignee, who performed the
    assignment, and when are all already captured there."""
    customer_crud.read_one(db, customer_id, user=user)  # 404s if out of scope
    if payload.assigned_to is not None:
        from app.services.sales_home_service import list_assignable_customer_owners

        # A salesman, the Sales Manager themselves, or an admin -- see
        # list_assignable_customer_owners's own docstring. Not just
        # "another salesman": the manager needs to be able to pull a
        # customer back onto their own plate or hand it to an admin too.
        if payload.assigned_to not in {u.id for u in list_assignable_customer_owners(db)}:
            raise ValidationAppError(
                "Customers can only be assigned to an active Sales salesman, the Sales Manager, or an admin."
            )
    return customer_crud.update(db, customer_id, {"assigned_to": payload.assigned_to}, user_id=user.id)
