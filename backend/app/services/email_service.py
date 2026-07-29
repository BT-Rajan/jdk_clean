"""Sends business documents (PDF bytes from pdf_generator.py) as email
attachments. SMTP credentials are .env-only (see core/config.py) --
deliberately not part of the Settings DB table/UI, since they're
infrastructure config rather than a day-to-day business setting.

Uses only the standard library (smtplib/email), matching the same
dependency-light philosophy pdf_generator.py states for itself -- no new
package needed for something this standard.
"""

import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings
from app.core.exceptions import AppError, ValidationAppError


def is_configured() -> bool:
    return bool(get_settings().SMTP_HOST)


def send_document_email(
    to_email: str,
    subject: str,
    body: str,
    attachment_bytes: bytes,
    attachment_filename: str,
) -> None:
    """Sends a plain-text email with a single PDF attachment. Raises
    AppError with a clear, user-facing message on any failure -- an
    unconfigured server, a bad recipient address, or an SMTP-level
    failure all surface the same way to the API layer, which is what
    lets the frontend just show the message directly rather than
    special-casing each failure mode.
    """
    settings = get_settings()
    if not settings.SMTP_HOST:
        raise AppError(
            "Email isn't configured on this server yet. Set SMTP_HOST (and the "
            "other SMTP_* variables) in the backend's .env file."
        )
    if not to_email or "@" not in to_email:
        raise ValidationAppError("Enter a valid recipient email address.")

    from_display = (
        f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        if settings.SMTP_FROM_NAME
        else settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
    )

    message = MIMEMultipart()
    message["From"] = from_display
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain"))

    attachment = MIMEApplication(attachment_bytes, Name=attachment_filename)
    attachment["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
    message.attach(attachment)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.sendmail(
                settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME, [to_email], message.as_string()
            )
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        raise AppError(f"Could not send email: {exc}") from exc
