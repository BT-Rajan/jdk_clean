import io
import uuid
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ValidationAppError
from app.models.user import User
from app.services import audit_service

ALLOWED_AVATAR_FORMATS = {"JPEG", "PNG", "WEBP"}
TABLE_NAME = "users"

# backend/app/services/profile_service.py -> parents[2] is backend/, the
# project root pm2's ecosystem config runs the process from (see
# install.sh). Anchoring a relative UPLOAD_DIR here -- rather than
# resolving it against whatever the current process's cwd happens to be
# -- means avatar storage location can't silently shift if the backend is
# ever started a different way (a different terminal, a different process
# manager, `python -m app.main` from the repo root, etc.), which would
# otherwise make previously-uploaded avatars simply "disappear" from a
# process looking in a different `uploads/` than the one that wrote them.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _avatars_dir() -> Path:
    settings = get_settings()
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.is_absolute():
        upload_dir = _BACKEND_ROOT / upload_dir
    path = upload_dir / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def update_profile(db: Session, user: User, full_name: str | None, phone: str | None) -> User:
    changes: dict[str, tuple] = {}

    if full_name is not None and full_name != user.full_name:
        changes["full_name"] = (user.full_name, full_name)
        user.full_name = full_name

    if phone is not None and phone != user.phone:
        changes["phone"] = (user.phone, phone)
        user.phone = phone

    if changes:
        audit_service.log_update(db, TABLE_NAME, user.id, changes, user.id)
        db.commit()
        db.refresh(user)

    return user


def save_avatar(db: Session, user: User, raw_bytes: bytes) -> User:
    settings = get_settings()
    max_bytes = settings.AVATAR_MAX_UPLOAD_MB * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise ValidationAppError(f"Image must be under {settings.AVATAR_MAX_UPLOAD_MB} MB.")

    # Never trust the client-supplied Content-Type header -- actually decode
    # the bytes and let Pillow's own format sniffing decide what this is.
    # Image.open also enforces Image.MAX_IMAGE_PIXELS, guarding against
    # decompression-bomb-style uploads (absurd pixel counts in a small file).
    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.verify()
        # verify() leaves the file object unusable for further decoding,
        # so re-open it to actually process the pixel data below.
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationAppError("That doesn't look like a valid image file.") from exc

    if image.format not in ALLOWED_AVATAR_FORMATS:
        raise ValidationAppError("Please upload a JPEG, PNG, or WEBP image.")

    # Normalize: strip any embedded EXIF/metadata (re-encoding from scratch
    # rather than copying it forward), flatten transparency onto white,
    # and cap the dimensions so stored avatars stay small and uniform.
    if image.mode not in ("RGB", "L"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    else:
        image = image.convert("RGB")

    max_dim = settings.AVATAR_MAX_DIMENSION
    image.thumbnail((max_dim, max_dim), Image.LANCZOS)

    old_filename = user.avatar_filename
    new_filename = f"{uuid.uuid4().hex}.jpg"
    avatars_dir = _avatars_dir()

    # Commit the DB change *before* touching the filesystem. image.save()
    # below is a side effect outside the DB transaction -- if it ran first
    # and something after it failed (the audit log insert, a dropped DB
    # connection, anything), the file would already be sitting on disk
    # while the transaction rolled back, leaving a real image file that
    # user.avatar_filename never actually points to: the upload looks
    # like it silently did nothing, since avatar_url stays null/unchanged
    # and nothing on disk is reachable through the API. Committing first
    # means a failure here leaves no orphaned file at all. A failure in
    # the save() call afterwards is possible instead, but is a much
    # smaller blast radius (a local disk write, not a multi-statement DB
    # transaction) and fails loudly -- get_avatar_path()'s is_file()
    # check means the avatar simply won't load, rather than silently not
    # existing despite an apparently-successful upload.
    user.avatar_filename = new_filename
    audit_service.log_update(
        db, TABLE_NAME, user.id, {"avatar_filename": (old_filename, new_filename)}, user.id
    )
    db.commit()
    db.refresh(user)

    image.save(avatars_dir / new_filename, format="JPEG", quality=85, optimize=True)

    if old_filename:
        (avatars_dir / old_filename).unlink(missing_ok=True)

    return user


def delete_avatar(db: Session, user: User) -> User:
    if not user.avatar_filename:
        return user

    old_filename = user.avatar_filename
    user.avatar_filename = None
    audit_service.log_update(
        db, TABLE_NAME, user.id, {"avatar_filename": (old_filename, None)}, user.id
    )
    db.commit()
    db.refresh(user)

    (_avatars_dir() / old_filename).unlink(missing_ok=True)
    return user


def get_avatar_path(user: User) -> Path | None:
    if not user.avatar_filename:
        return None
    path = _avatars_dir() / user.avatar_filename
    return path if path.is_file() else None
