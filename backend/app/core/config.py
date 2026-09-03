from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> backend/ is three parents up. Anchored to
# an absolute path rather than the plain relative ".env" that used to be
# here: pydantic-settings resolves a relative env_file against whatever
# directory the process happens to be started from, not the project
# root -- fine for the app itself (pm2 sets cwd to backend/), but every
# script in backend/scripts/ is run directly (`cd scripts && python3
# reset_password.py`), which silently pointed env_file at a
# backend/scripts/.env that's never existed. pydantic-settings doesn't
# error when the file is missing -- it just falls through to every
# field's hardcoded default (DB_USER "erp_user", no password, ...),
# which is exactly the class of bug that looked like ".env isn't being
# read" when .env was correct all along.
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    APP_NAME: str = "Manufacturing ERP"
    ENV: str = "development"

    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "erp_user"
    DB_PASSWORD: str = ""
    DB_NAME: str = "jdk_clean"

    JWT_SECRET_KEY: str = "change-me-in-env"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:4173"

    UPLOAD_DIR: str = "uploads"
    AVATAR_MAX_UPLOAD_MB: int = 5
    AVATAR_MAX_DIMENSION: int = 512
    # Company logos aren't thumbnailed like avatars (see
    # company_logo_service.py -- a logo can legitimately be any
    # resolution), so there's no matching MAX_DIMENSION here, just a
    # separate upload-size cap.
    LOGO_MAX_UPLOAD_MB: int = 5
    # .docx document templates (see doc_template_service.py) run bigger
    # than a logo image -- a template can carry embedded letterhead
    # artwork -- so it gets its own, larger cap.
    DOC_TEMPLATE_MAX_UPLOAD_MB: int = 10

    # Email (Phase 6): deliberately .env-only, not part of the Settings
    # DB table/UI (see settings_service.py) -- SMTP credentials are
    # infrastructure config, not day-to-day business settings, same
    # reasoning DB_* already follows. SMTP_HOST empty means email isn't
    # configured; email_service.py fails with a clear, actionable error
    # rather than a confusing SMTP connection failure.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = ""
    SMTP_USE_TLS: bool = True

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
