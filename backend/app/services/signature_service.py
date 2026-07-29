import io
import uuid
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationAppError
from app.models.user import User
from app.services import audit_service

# PNG is allowed (and likely to be the common case, since a signature with
# a transparent background prints/embeds far more cleanly on a document
# than one with a white box around it) -- unlike avatars, transparency is
# preserved rather than flattened onto white, see save_signature() below.
ALLOWED_SIGNATURE_FORMATS = {"JPEG", "PNG", "WEBP"}
TABLE_NAME = "users"

# Mirrors profile_service.py's _BACKEND_ROOT exactly -- same reasoning:
# anchor a relative UPLOAD_DIR to the backend project root rather than the
# process's ambient cwd, so storage location can't silently shift.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _signatures_dir() -> Path:
    settings = get_settings()
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.is_absolute():
        upload_dir = _BACKEND_ROOT / upload_dir
    path = upload_dir / "signatures"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_target_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if user is None:
        raise NotFoundError("User")
    return user


def save_signature(
    db: Session, admin_id: int | None, target_user: User, raw_bytes: bytes
) -> User:
    """Admin uploads and assigns a signature image directly to target_user
    -- no self-upload, no pending/approval state. Only admin/manager (see
    api/users.py's write guard) can call this at all, and it always acts
    on someone else's account, so audit entries are attributed to the
    admin performing the action, not the user being signed for."""
    settings = get_settings()
    max_bytes = settings.AVATAR_MAX_UPLOAD_MB * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise ValidationAppError(f"Image must be under {settings.AVATAR_MAX_UPLOAD_MB} MB.")

    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.verify()
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationAppError("That doesn't look like a valid image file.") from exc

    if image.format not in ALLOWED_SIGNATURE_FORMATS:
        raise ValidationAppError("Please upload a JPEG, PNG, or WEBP image.")

    # Keep transparency (a signature on a transparent background embeds
    # cleanly into a document; avatars flatten to white because a photo
    # never has real transparency worth preserving, but a signature scan
    # often does). Only convert if there's no alpha channel to keep.
    if image.mode not in ("RGBA", "LA") and "transparency" not in image.info:
        image = image.convert("RGB")
    elif image.mode != "RGBA":
        image = image.convert("RGBA")

    max_dim = settings.AVATAR_MAX_DIMENSION
    image.thumbnail((max_dim, max_dim), Image.LANCZOS)

    old_filename = target_user.signature_filename
    is_png = image.mode == "RGBA"
    new_filename = f"{uuid.uuid4().hex}.{'png' if is_png else 'jpg'}"
    signatures_dir = _signatures_dir()

    # Same ordering as profile_service.save_avatar and the same reasoning:
    # commit the DB change before writing the file, so a failure here never
    # leaves an orphaned file the DB doesn't know about.
    target_user.signature_filename = new_filename
    audit_service.log_update(
        db, TABLE_NAME, target_user.id, {"signature_filename": (old_filename, new_filename)}, admin_id
    )
    db.commit()
    db.refresh(target_user)

    if is_png:
        image.save(signatures_dir / new_filename, format="PNG", optimize=True)
    else:
        image.save(signatures_dir / new_filename, format="JPEG", quality=90, optimize=True)

    if old_filename:
        (signatures_dir / old_filename).unlink(missing_ok=True)

    return target_user


def delete_signature(db: Session, admin_id: int | None, target_user: User) -> User:
    if not target_user.signature_filename:
        return target_user

    old_filename = target_user.signature_filename
    target_user.signature_filename = None
    audit_service.log_update(
        db, TABLE_NAME, target_user.id, {"signature_filename": (old_filename, None)}, admin_id
    )
    db.commit()
    db.refresh(target_user)

    (_signatures_dir() / old_filename).unlink(missing_ok=True)
    return target_user


def get_signature_path(user: User) -> Path | None:
    if not user.signature_filename:
        return None
    path = _signatures_dir() / user.signature_filename
    return path if path.is_file() else None
