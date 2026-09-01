from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    role: str = Field(default="staff", pattern="^(admin|manager|staff|viewer)$")
    # Validated against the Department master (app/crud/master_data.py's
    # UserCRUD), not a hardcoded pattern -- see app/models/department.py.
    department_id: int | None = None


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    # Admin-side counterpart to MeUpdate.phone below -- lets an admin/manager
    # fix a wrong or missing contact number for someone else's account
    # instead of that only ever being self-service.
    phone: str | None = Field(default=None, max_length=30)
    role: str | None = Field(default=None, pattern="^(admin|manager|staff|viewer)$")
    department_id: int | None = None
    is_active: bool | None = None
    # Org chart reporting line (Members only) -- see app/api/users.py
    # update_user for the "must be an active manager" validation and
    # models/user.py for why this is None for admin/manager rows. Pass
    # null explicitly to unassign (drag a Member to the "Unassigned" tray).
    manager_id: int | None = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    full_name: str
    phone: str | None = None
    role: str
    department_id: int | None = None
    department_code: str | None = None
    department_name: str | None = None
    manager_id: int | None = None
    is_active: bool
    has_signature: bool = False

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, obj) -> "UserOut":
        data = cls.model_validate(obj)
        data.has_signature = bool(obj.signature_filename)
        data.department_code = obj.department_code
        data.department_name = obj.department.name if obj.department else None
        return data


class MeUpdate(BaseModel):
    """Self-service profile update -- deliberately narrower than UserUpdate
    (admin-only): a user can update their own contact details, but not
    their own role, department, active status, or (for now) email/username."""

    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=30)


class MeOut(UserOut):
    """UserOut plus the fields that only make sense in a 'this is me'
    context -- avatar_url always points at the caller's own avatar, which
    would be misleading if reused on UserOut for admins viewing other
    users (see api/users.py)."""

    avatar_url: str | None = None
