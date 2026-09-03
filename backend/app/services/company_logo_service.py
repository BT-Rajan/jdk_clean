import io
import uuid
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ValidationAppError
from app.models.setting import Setting
from app.services.settings_service import LOGO_VARIANTS, get_masked

ALLOWED_LOGO_FORMATS = {"JPEG", "PNG", "WEBP"}

# backend/app/services/company_logo_service.py -> parents[2] is backend/,
# same anchoring as profile_service._BACKEND_ROOT and
# signature_service._BACKEND_ROOT and for the same reason.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _logos_dir() -> Path:
    settings = get_settings()
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.is_absolute():
        upload_dir = _BACKEND_ROOT / upload_dir
    path = upload_dir / "logos"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _filename_key(variant: str) -> str:
    return f"company_logo_{variant}_filename"


def save_logo(db: Session, variant: str, raw_bytes: bytes) -> dict:
    if variant not in LOGO_VARIANTS:
        raise ValidationAppError("Unknown logo variant.")

    settings = get_settings()
    max_bytes = settings.LOGO_MAX_UPLOAD_MB * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise ValidationAppError(f"Image must be under {settings.LOGO_MAX_UPLOAD_MB} MB.")

    # Never trust the client-supplied Content-Type -- decode the bytes and
    # let Pillow's own format sniffing decide (also enforces
    # Image.MAX_IMAGE_PIXELS, guarding against decompression-bomb uploads).
    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.verify()
        # verify() leaves the file object unusable for further decoding,
        # so re-open it to actually process the pixel data below.
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationAppError("That doesn't look like a valid image file.") from exc

    if image.format not in ALLOWED_LOGO_FORMATS:
        raise ValidationAppError("Please upload a JPEG, PNG, or WEBP image.")

    # Preserve transparency (same reasoning as signature_service.py: a
    # logo dropped onto a dark or light page looks wrong with a forced
    # white box around it) -- only flatten when there's genuinely no
    # alpha channel worth keeping.
    if image.mode not in ("RGBA", "LA") and "transparency" not in image.info:
        image = image.convert("RGB")
    elif image.mode != "RGBA":
        image = image.convert("RGBA")

    # No thumbnail()/resize here, unlike avatars and signatures -- a
    # company logo is stored at whatever resolution it was uploaded at.
    # Fixed width/height constraints can be layered on top of this later
    # without changing the upload path itself.

    key = _filename_key(variant)
    row = db.query(Setting).filter(Setting.setting_key == key).first()
    old_filename = row.setting_value if row else None

    is_png = image.mode == "RGBA"
    new_filename = f"{uuid.uuid4().hex}.{'png' if is_png else 'jpg'}"
    logos_dir = _logos_dir()

    # Commit the DB row before writing the file, same ordering (and same
    # reasoning) as profile_service.save_avatar: a failure here leaves no
    # orphaned file the DB doesn't know about.
    if row is None:
        row = Setting(setting_key=key, setting_value=new_filename)
        db.add(row)
    else:
        row.setting_value = new_filename
    db.commit()

    if is_png:
        image.save(logos_dir / new_filename, format="PNG", optimize=True)
    else:
        image.save(logos_dir / new_filename, format="JPEG", quality=90, optimize=True)

    if old_filename:
        (logos_dir / old_filename).unlink(missing_ok=True)

    return get_masked(db)


def delete_logo(db: Session, variant: str) -> dict:
    if variant not in LOGO_VARIANTS:
        raise ValidationAppError("Unknown logo variant.")

    row = db.query(Setting).filter(Setting.setting_key == _filename_key(variant)).first()
    if row is None or not row.setting_value:
        return get_masked(db)

    old_filename = row.setting_value
    row.setting_value = None

    # If the logo being removed is the currently-active one, clear that
    # selection too -- otherwise company_logo_active would keep pointing
    # at a variant with no file behind it.
    active_row = db.query(Setting).filter(Setting.setting_key == "company_logo_active").first()
    if active_row is not None and active_row.setting_value == variant:
        active_row.setting_value = ""

    db.commit()

    (_logos_dir() / old_filename).unlink(missing_ok=True)
    return get_masked(db)


def get_logo_path(db: Session, variant: str) -> Path | None:
    if variant not in LOGO_VARIANTS:
        return None
    row = db.query(Setting).filter(Setting.setting_key == _filename_key(variant)).first()
    if row is None or not row.setting_value:
        return None
    path = _logos_dir() / row.setting_value
    return path if path.is_file() else None


def get_active_logo_path(db: Session) -> Path | None:
    """The one logo variant the admin has picked as active (see
    company_logo_active in GeneralSettingsForm), if any -- what
    app/api/settings.py's public .../logo/active endpoint serves for
    the app chrome's <Logo> (top-left nav, login page) to show instead
    of the hardcoded wordmark fallback."""
    row = db.query(Setting).filter(Setting.setting_key == "company_logo_active").first()
    if row is None or not row.setting_value:
        return None
    return get_logo_path(db, row.setting_value)
