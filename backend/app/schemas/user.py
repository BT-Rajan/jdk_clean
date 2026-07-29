from pydantic import BaseModel, EmailStr, Field

DEPARTMENT_PATTERN = "^(sales|procurement|warehouse)$"


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=120)
    role: str = Field(default="staff", pattern="^(admin|manager|staff|viewer)$")
    department: str | None = Field(default=None, pattern=DEPARTMENT_PATTERN)


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = Field(default=None, pattern="^(admin|manager|staff|viewer)$")
    department: str | None = Field(default=None, pattern=DEPARTMENT_PATTERN)
    is_active: bool | None = None


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    full_name: str
    phone: str | None = None
    role: str
    department: str | None = None
    is_active: bool
    has_signature: bool = False

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, obj) -> "UserOut":
        data = cls.model_validate(obj)
        data.has_signature = bool(obj.signature_filename)
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
