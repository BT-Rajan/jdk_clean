"""Sends business documents (PDF bytes from pdf_generator.py) as email
attachments. SMTP credentials come from .env (see core/config.py) when
set -- infrastructure config, for a dedicated sending account -- and
otherwise fall back to the mailbox saved under Communication -> Email
(see email_account_service.get_smtp_credentials), so the one mailbox an
admin already configured and tested there is enough on its own; .env
just lets that be overridden without touching the database.

Uses only the standard library (smtplib/email), matching the same
dependency-light philosophy pdf_generator.py states for itself -- no new
package needed for something this standard.
"""

import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import AppError, ValidationAppError
from app.services import email_account_service


def _resolve_smtp_config(db: Session) -> dict | None:
    settings = get_settings()
    if settings.SMTP_HOST:
        return {
            "host": settings.SMTP_HOST,
            "port": settings.SMTP_PORT,
            "use_tls": settings.SMTP_USE_TLS,
            "username": settings.SMTP_USERNAME,
            "password": settings.SMTP_PASSWORD,
            "from_email": settings.SMTP_FROM_EMAIL,
            "from_name": settings.SMTP_FROM_NAME,
        }
    return email_account_service.get_smtp_credentials(db)


def is_configured(db: Session) -> bool:
    return _resolve_smtp_config(db) is not None


def send_document_email(
    db: Session,
    to_email: str,
    subject: str,
    body: str,
    attachment_bytes: bytes | None,
    attachment_filename: str | None,
) -> None:
    """Sends a plain-text email, optionally with a single PDF attachment
    (pass attachment_bytes=None to send body text only -- e.g. when a
    recipient's mail gateway is dropping messages with attachments).
    Raises AppError with a clear, user-facing message on any failure --
    an unconfigured server, a bad recipient address, or an SMTP-level
    failure all surface the same way to the API layer, which is what
    lets the frontend just show the message directly rather than
    special-casing each failure mode.
    """
    config = _resolve_smtp_config(db)
    if config is None:
        raise AppError(
            "Email isn't configured on this server yet. Set SMTP_HOST (and the "
            "other SMTP_* variables) in the backend's .env file, or save a "
            "mailbox with a password under Communication -> Email."
        )
    if not to_email or "@" not in to_email:
        raise ValidationAppError("Enter a valid recipient email address.")

    from_display = (
        f"{config['from_name']} <{config['from_email']}>"
        if config["from_name"]
        else config["from_email"] or config["username"]
    )

    message = MIMEMultipart()
    message["From"] = from_display
    message["To"] = to_email
    message["Subject"] = subject
    # Both are required by RFC 5322 and their absence is a common,
    # easy-to-miss reason a receiving mail server spam-scores or
    # silently drops an otherwise legitimate message.
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=config["from_email"].rsplit("@", 1)[-1] or None)
    message.attach(MIMEText(body, "plain"))

    if attachment_bytes is not None:
        attachment = MIMEApplication(attachment_bytes, Name=attachment_filename)
        attachment["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
        message.attach(attachment)

    try:
        with smtplib.SMTP(config["host"], config["port"], timeout=15) as server:
            if config["use_tls"]:
                server.starttls()
            if config["username"]:
                server.login(config["username"], config["password"])
            server.sendmail(
                config["from_email"] or config["username"], [to_email], message.as_string()
            )
    except smtplib.SMTPNotSupportedError as exc:
        # Almost always means AUTH was attempted over a connection the
        # server never upgraded to TLS -- most servers only advertise
        # AUTH after STARTTLS, so this is the standard symptom of
        # Encryption being set to "None" (or the wrong port for it).
        raise AppError(
            f"Could not send email: {exc} This usually means the mailbox's SMTP "
            "Encryption is set to \"None\" -- set it to STARTTLS (or SSL/TLS, "
            "matching the port) under Communication -> Email and save."
        ) from exc
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        raise AppError(f"Could not send email: {exc}") from exc
