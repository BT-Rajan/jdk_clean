from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import AppError, AuthError, ValidationAppError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User


def _issue_tokens(db: Session, user: User) -> dict:
    access_token = create_access_token(str(user.id), {"role": user.role})
    refresh_token, jti, expires_at = create_refresh_token(str(user.id))

    db.add(
        RefreshToken(
            jti=jti,
            user_id=user.id,
            expires_at=expires_at,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


def login(db: Session, username: str, password: str) -> dict:
    user = db.query(User).filter(User.username == username, User.deleted_at.is_(None)).first()
    if user is None or not verify_password(password, user.password_hash):
        raise AuthError("Invalid username or password.")
    if not user.is_active:
        raise AuthError("This account has been deactivated.")
    return _issue_tokens(db, user)


def refresh(db: Session, refresh_token: str) -> dict:
    try:
        payload = decode_token(refresh_token)
    except ValueError as exc:
        raise AuthError("Invalid or expired refresh token.") from exc

    if payload.get("type") != "refresh":
        raise AuthError("Invalid token type.")

    jti = payload.get("jti")
    record = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if record is None or record.revoked:
        raise AuthError("This session has been revoked. Please log in again.")
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise AuthError("Session expired. Please log in again.")

    user = db.query(User).filter(User.id == int(payload["sub"]), User.deleted_at.is_(None)).first()
    if user is None or not user.is_active:
        raise AuthError("Account is no longer active.")

    # Rotate: revoke the used refresh token and issue a new pair.
    record.revoked = True
    db.commit()
    return _issue_tokens(db, user)


def logout(db: Session, refresh_token: str) -> None:
    try:
        payload = decode_token(refresh_token)
    except ValueError:
        return  # already invalid — nothing to revoke
    jti = payload.get("jti")
    record = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if record is not None:
        record.revoked = True
        db.commit()


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AppError("Current password is incorrect.")
    if current_password == new_password:
        raise ValidationAppError("New password must be different from the current password.")
    user.password_hash = hash_password(new_password)
    db.commit()
    # Force re-login everywhere by revoking all outstanding refresh tokens.
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)
    ).update({"revoked": True})
    db.commit()
