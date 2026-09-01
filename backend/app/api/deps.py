from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AuthError, PermissionError_
from app.core.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


class ListParams:
    """Shared list/search/sort/paginate query params for every master
    router built with app.api.common.build_crud_router. `filters` only
    ever contains keys a given master's CRUD class actually whitelists
    in `filterable_fields` (see app/crud/base.py's BaseCRUD.read_all) --
    passing an irrelevant one here is harmless, it's just ignored.

    Each field below exists because some master already declares it in
    `filterable_fields`; add a new query param here (not a per-router
    override) when a new master needs a new filterable column, so every
    master keeps the same query-string shape.
    """

    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(10, ge=1, le=200),
        search: str | None = Query(None),
        sort: str | None = Query(None),
        status: str | None = Query(None),
        city: str | None = Query(None),
        country: str | None = Query(None),
        mode_of_supply: str | None = Query(None),
        role: str | None = Query(None),
        product_type: str | None = Query(None),
        category: str | None = Query(None),
        department_id: int | None = Query(None),
        # Users' active/inactive state is a real boolean column
        # (users.is_active), not the string status ENUM the generic
        # `status` param above assumes -- see app/crud/master_data.py's
        # UserCRUD.filterable_fields. Kept as its own param rather than
        # overloading `status` so it round-trips as an actual bool
        # through Query() instead of a string that would need parsing.
        is_active: bool | None = Query(None),
    ):
        self.page = page
        self.page_size = page_size
        self.search = search
        self.sort = sort
        raw = {
            "status": status,
            "city": city,
            "country": country,
            "mode_of_supply": mode_of_supply,
            "role": role,
            "is_active": is_active,
            "product_type": product_type,
            "category": category,
            "department_id": department_id,
        }
        self.filters = {k: v for k, v in raw.items() if v is not None}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise AuthError("Authentication required.")
    try:
        payload = decode_token(credentials.credentials)
    except ValueError as exc:
        raise AuthError("Invalid or expired token.") from exc

    if payload.get("type") != "access":
        raise AuthError("Invalid token type.")

    user = db.query(User).filter(User.id == int(payload["sub"]), User.deleted_at.is_(None)).first()
    if user is None or not user.is_active:
        raise AuthError("Account is no longer active.")
    return user


def require_role(*allowed_roles: str):
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise PermissionError_()
        return user

    return _check


