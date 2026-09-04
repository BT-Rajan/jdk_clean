"""Uploadable identity document (image or PDF) shared by customers and
suppliers -- proof of the Civil ID / Registration number a customer
types in, or of a supplier's own registration. Mirrors profile_service.
py's avatar upload (same commit-before-write-to-disk ordering, same
old-file-cleanup-after-commit reasoning), but accepts a PDF alongside
JPEG/PNG/WEBP, so images aren't re-encoded/thumbnailed the way an
avatar is -- these are kept byte-for-byte as uploaded.

Generic across both entity kinds: callers pass the CRUD (customer_crud
or supplier_crud), its audit table_name, and the upload subdirectory
name, rather than this module importing either model directly.
"""

import io
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ValidationAppError
from app.services import audit_service

ALLOWED_IMAGE_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
PDF_MAGIC = b"%PDF-"

# backend/app/services/id_document_service.py -> parents[2] is backend/,
# same anchoring reasoning as profile_service.py's _BACKEND_ROOT.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _upload_dir(subdir: str) -> Path:
    settings = get_settings()
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.is_absolute():
        upload_dir = _BACKEND_ROOT / upload_dir
    path = upload_dir / subdir
    path.mkdir(parents=True, exist_ok=True)
    return path


def _sniff_extension(raw_bytes: bytes) -> str:
    """Never trusts the client-supplied filename/Content-Type -- decides
    what this actually is from the bytes themselves, same reasoning
    profile_service.save_avatar uses for images. A PDF is recognized by
    its standard magic bytes; anything else has to decode as one of the
    allowed image formats via Pillow's own format sniffing."""
    if raw_bytes[:5] == PDF_MAGIC:
        return "pdf"
    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationAppError("Please upload a JPEG, PNG, or WEBP image, or a PDF.") from exc
    ext = ALLOWED_IMAGE_FORMATS.get(image.format or "")
    if ext is None:
        raise ValidationAppError("Please upload a JPEG, PNG, or WEBP image, or a PDF.")
    return ext


def _media_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    return {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(ext, "application/octet-stream")


def save_document(
    db: Session,
    entity: Any,
    raw_bytes: bytes,
    *,
    subdir: str,
    table_name: str,
    user_id: int | None,
) -> Any:
    settings = get_settings()
    max_bytes = settings.ID_DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise ValidationAppError(f"File must be under {settings.ID_DOCUMENT_MAX_UPLOAD_MB} MB.")

    ext = _sniff_extension(raw_bytes)
    old_filename = entity.id_document_filename
    new_filename = f"{uuid.uuid4().hex}.{ext}"
    directory = _upload_dir(subdir)

    # Re-uploading replaces whatever an admin may have already verified
    # against the old file -- that verification doesn't carry over to a
    # document nobody has looked at yet.
    old_verified = entity.id_verified
    entity.id_document_filename = new_filename
    entity.id_verified = False
    entity.id_verified_at = None
    entity.id_verified_by = None
    audit_service.log_update(
        db,
        table_name,
        entity.id,
        {"id_document_filename": (old_filename, new_filename), "id_verified": (old_verified, False)},
        user_id,
    )
    # Commit before touching the filesystem -- see profile_service.
    # save_avatar's identical ordering and reasoning: a failure below is
    # a local disk write (small blast radius, fails loudly via
    # get_document_path's is_file() check) rather than a DB transaction
    # left half-applied with an orphaned file already on disk.
    db.commit()
    db.refresh(entity)

    (directory / new_filename).write_bytes(raw_bytes)

    if old_filename:
        (directory / old_filename).unlink(missing_ok=True)

    return entity


def delete_document(db: Session, entity: Any, *, subdir: str, table_name: str, user_id: int | None) -> Any:
    if not entity.id_document_filename:
        return entity

    old_filename = entity.id_document_filename
    old_verified = entity.id_verified
    entity.id_document_filename = None
    entity.id_verified = False
    entity.id_verified_at = None
    entity.id_verified_by = None
    audit_service.log_update(
        db,
        table_name,
        entity.id,
        {"id_document_filename": (old_filename, None), "id_verified": (old_verified, False)},
        user_id,
    )
    db.commit()
    db.refresh(entity)

    (_upload_dir(subdir) / old_filename).unlink(missing_ok=True)
    return entity


def get_document_file(entity: Any, *, subdir: str) -> tuple[Path, str] | None:
    """Returns (path, media_type) for the entity's document, or None if
    there isn't one or the file's gone missing from disk."""
    if not entity.id_document_filename:
        return None
    path = _upload_dir(subdir) / entity.id_document_filename
    if not path.is_file():
        return None
    return path, _media_type(entity.id_document_filename)


def verify(db: Session, entity: Any, *, table_name: str, user_id: int | None) -> Any:
    if not entity.id_document_filename:
        raise ValidationAppError("Upload an id document before marking it verified.")
    old = entity.id_verified
    entity.id_verified = True
    entity.id_verified_at = datetime.now(timezone.utc)
    entity.id_verified_by = user_id
    audit_service.log_update(db, table_name, entity.id, {"id_verified": (old, True)}, user_id)
    db.commit()
    db.refresh(entity)
    return entity


def unverify(db: Session, entity: Any, *, table_name: str, user_id: int | None) -> Any:
    old = entity.id_verified
    entity.id_verified = False
    entity.id_verified_at = None
    entity.id_verified_by = None
    audit_service.log_update(db, table_name, entity.id, {"id_verified": (old, False)}, user_id)
    db.commit()
    db.refresh(entity)
    return entity
