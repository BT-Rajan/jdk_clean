from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AuthError, PermissionError_
from app.core.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


class ListParams:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=200),
        search: str | None = Query(None),
        sort: str | None = Query(None),
        status: str | None = Query(None),
    ):
        self.page = page
        self.page_size = page_size
        self.search = search
        self.sort = sort
        self.filters = {"status": status} if status else {}


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
