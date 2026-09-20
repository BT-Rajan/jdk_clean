"""Uploadable avatar/logo shared by any master-data entity that has an
`avatar_filename` column (currently just customers -- see
app/models/customer.py). Mirrors profile_service.py's save_avatar (same
image normalization: strip metadata, flatten transparency, cap
dimensions, re-encode to JPEG) but generic across entity kinds the same
way id_document_service.py is, rather than hardcoded to `User`.
"""

import io
import uuid
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ValidationAppError
from app.services import audit_service

ALLOWED_AVATAR_FORMATS = {"JPEG", "PNG", "WEBP"}

# backend/app/services/avatar_service.py -> parents[2] is backend/, same
# anchoring reasoning as profile_service.py's _BACKEND_ROOT.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _upload_dir(subdir: str) -> Path:
    settings = get_settings()
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.is_absolute():
        upload_dir = _BACKEND_ROOT / upload_dir
    path = upload_dir / subdir
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_avatar(
    db: Session, entity: Any, raw_bytes: bytes, *, subdir: str, table_name: str, user_id: int | None
) -> Any:
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

    if image.format not in ALLOWED_AVATAR_FORMATS:
        raise ValidationAppError("Please upload a JPEG, PNG, or WEBP image.")

    if image.mode not in ("RGB", "L"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    else:
        image = image.convert("RGB")

    max_dim = settings.AVATAR_MAX_DIMENSION
    image.thumbnail((max_dim, max_dim), Image.LANCZOS)

    old_filename = entity.avatar_filename
    new_filename = f"{uuid.uuid4().hex}.jpg"
    directory = _upload_dir(subdir)

    # Commit before touching the filesystem -- see profile_service.
    # save_avatar's identical ordering and reasoning.
    entity.avatar_filename = new_filename
    audit_service.log_update(
        db, table_name, entity.id, {"avatar_filename": (old_filename, new_filename)}, user_id
    )
    db.commit()
    db.refresh(entity)

    image.save(directory / new_filename, format="JPEG", quality=85, optimize=True)

    if old_filename:
        (directory / old_filename).unlink(missing_ok=True)

    return entity


def delete_avatar(db: Session, entity: Any, *, subdir: str, table_name: str, user_id: int | None) -> Any:
    if not entity.avatar_filename:
        return entity

    old_filename = entity.avatar_filename
    entity.avatar_filename = None
    audit_service.log_update(db, table_name, entity.id, {"avatar_filename": (old_filename, None)}, user_id)
    db.commit()
    db.refresh(entity)

    (_upload_dir(subdir) / old_filename).unlink(missing_ok=True)
    return entity


def get_avatar_path(entity: Any, *, subdir: str) -> Path | None:
    if not entity.avatar_filename:
        return None
    path = _upload_dir(subdir) / entity.avatar_filename
    return path if path.is_file() else None
