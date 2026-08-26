"""Communication module, email channel: the one admin-configured mailbox
account used for both receiving (IMAP or POP3, admin's choice) and
sending (SMTP). Only one row ever exists in practice -- `get_or_create`
below always returns/creates id=1's row rather than supporting a list,
which is deliberate: one org mailbox, not a per-user inbox.
"""

import imaplib
import poplib
import smtplib
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.exceptions import ValidationAppError
from app.models.email_account import EmailAccount

# Known-host presets, keyed by provider id -- the frontend shows these as
# picker options and fills the host/port fields on selection; "custom"
# leaves them for the admin to type. Values are the standard published
# server settings for each provider as of this writing.
PROVIDER_PRESETS: dict[str, dict] = {
    "gmail": {
        "label": "Gmail",
        "imap_host": "imap.gmail.com", "imap_port": 993, "imap_use_ssl": True,
        "pop3_host": "pop.gmail.com", "pop3_port": 995, "pop3_use_ssl": True,
        "smtp_host": "smtp.gmail.com", "smtp_port": 587, "smtp_use_tls": True,
        "note": "Use a Google App Password, not your normal login password (requires 2-Step Verification).",
    },
    "outlook": {
        "label": "Outlook / Microsoft 365",
        "imap_host": "outlook.office365.com", "imap_port": 993, "imap_use_ssl": True,
        "pop3_host": "outlook.office365.com", "pop3_port": 995, "pop3_use_ssl": True,
        "smtp_host": "smtp.office365.com", "smtp_port": 587, "smtp_use_tls": True,
        "note": "",
    },
    "yahoo": {
        "label": "Yahoo Mail",
        "imap_host": "imap.mail.yahoo.com", "imap_port": 993, "imap_use_ssl": True,
        "pop3_host": "pop.mail.yahoo.com", "pop3_port": 995, "pop3_use_ssl": True,
        "smtp_host": "smtp.mail.yahoo.com", "smtp_port": 587, "smtp_use_tls": True,
        "note": "Requires a Yahoo App Password.",
    },
    "icloud": {
        "label": "iCloud Mail",
        "imap_host": "imap.mail.me.com", "imap_port": 993, "imap_use_ssl": True,
        "pop3_host": "", "pop3_port": 995, "pop3_use_ssl": True,
        "smtp_host": "smtp.mail.me.com", "smtp_port": 587, "smtp_use_tls": True,
        "note": "iCloud does not support POP3 -- IMAP only.",
    },
    "custom": {
        "label": "Custom / other",
        "imap_host": "", "imap_port": 993, "imap_use_ssl": True,
        "pop3_host": "", "pop3_port": 995, "pop3_use_ssl": True,
        "smtp_host": "", "smtp_port": 587, "smtp_use_tls": True,
        "note": "",
    },
}


def _row(db: Session) -> EmailAccount:
    row = db.query(EmailAccount).order_by(EmailAccount.id.asc()).first()
    if row is None:
        preset = PROVIDER_PRESETS["gmail"]
        row = EmailAccount(
            provider="gmail",
            imap_host=preset["imap_host"], imap_port=preset["imap_port"], imap_use_ssl=preset["imap_use_ssl"],
            pop3_host=preset["pop3_host"], pop3_port=preset["pop3_port"], pop3_use_ssl=preset["pop3_use_ssl"],
            smtp_host=preset["smtp_host"], smtp_port=preset["smtp_port"], smtp_use_tls=preset["smtp_use_tls"],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: EmailAccount) -> dict:
    return {
        "id": row.id,
        "provider": row.provider,
        "email_address": row.email_address,
        "display_name": row.display_name,
        "username": row.username,
        "has_password": bool(row.password_encrypted),
        "incoming_protocol": row.incoming_protocol,
        "imap_host": row.imap_host, "imap_port": row.imap_port, "imap_use_ssl": row.imap_use_ssl,
        "pop3_host": row.pop3_host, "pop3_port": row.pop3_port, "pop3_use_ssl": row.pop3_use_ssl,
        "smtp_host": row.smtp_host, "smtp_port": row.smtp_port, "smtp_use_tls": row.smtp_use_tls,
        "is_active": row.is_active,
        "last_tested_at": row.last_tested_at,
        "last_test_ok": row.last_test_ok,
        "last_test_error": row.last_test_error,
    }


def get(db: Session) -> dict:
    return _to_out(_row(db))


def update(db: Session, data: dict, user_id: int) -> dict:
    row = _row(db)
    row.provider = data["provider"]
    row.email_address = data["email_address"]
    row.display_name = data["display_name"]
    row.username = data["username"] or data["email_address"]
    row.incoming_protocol = data["incoming_protocol"]
    row.imap_host = data["imap_host"]
    row.imap_port = data["imap_port"]
    row.imap_use_ssl = data["imap_use_ssl"]
    row.pop3_host = data["pop3_host"]
    row.pop3_port = data["pop3_port"]
    row.pop3_use_ssl = data["pop3_use_ssl"]
    row.smtp_host = data["smtp_host"]
    row.smtp_port = data["smtp_port"]
    row.smtp_use_tls = data["smtp_use_tls"]
    row.is_active = data["is_active"]
    row.updated_by = user_id

    password = data.get("password")
    if password is not None:
        row.password_encrypted = encrypt_secret(password) if password else None

    # Config changed -- the last test result no longer speaks to the
    # current settings, so don't leave a stale "OK" showing.
    row.last_tested_at = None
    row.last_test_ok = None
    row.last_test_error = None

    db.commit()
    db.refresh(row)
    return _to_out(row)


def _get_password(row: EmailAccount) -> str:
    if not row.password_encrypted:
        raise ValidationAppError("Set a mailbox password before testing the connection.")
    return decrypt_secret(row.password_encrypted)


def test_connection(db: Session) -> dict:
    """Opens (and immediately closes) a real connection with the saved
    settings: the chosen incoming protocol (IMAP or POP3) plus SMTP.
    Never raises -- failures come back as {"ok": False, "message": ...}
    so the API layer doesn't need to special-case each library's own
    exception types, and the UI can show the result inline either way.
    """
    row = _row(db)
    if not row.email_address:
        return _record_test(db, row, False, "Enter an email address first.")
    try:
        password = _get_password(row)
    except ValidationAppError as exc:
        return _record_test(db, row, False, exc.message)

    username = row.username or row.email_address

    try:
        if row.incoming_protocol == "imap":
            if not row.imap_host:
                return _record_test(db, row, False, "Enter an IMAP host first.")
            conn = imaplib.IMAP4_SSL(row.imap_host, row.imap_port) if row.imap_use_ssl \
                else imaplib.IMAP4(row.imap_host, row.imap_port)
            try:
                conn.login(username, password)
                conn.select("INBOX", readonly=True)
            finally:
                try:
                    conn.logout()
                except Exception:
                    pass
        else:
            if not row.pop3_host:
                return _record_test(db, row, False, "Enter a POP3 host first.")
            conn = poplib.POP3_SSL(row.pop3_host, row.pop3_port) if row.pop3_use_ssl \
                else poplib.POP3(row.pop3_host, row.pop3_port)
            try:
                conn.user(username)
                conn.pass_(password)
                conn.stat()
            finally:
                try:
                    conn.quit()
                except Exception:
                    pass
    except (imaplib.IMAP4.error, poplib.error_proto, OSError, TimeoutError) as exc:
        protocol = row.incoming_protocol.upper()
        return _record_test(db, row, False, f"{protocol} connection failed: {exc}")

    if row.smtp_host:
        try:
            with smtplib.SMTP(row.smtp_host, row.smtp_port, timeout=15) as server:
                if row.smtp_use_tls:
                    server.starttls()
                server.login(username, password)
        except (smtplib.SMTPException, OSError, TimeoutError) as exc:
            return _record_test(db, row, False, f"Incoming mail OK, but SMTP failed: {exc}")

    return _record_test(db, row, True, "Connected successfully (incoming and outgoing).")


def _record_test(db: Session, row: EmailAccount, ok: bool, message: str) -> dict:
    row.last_tested_at = datetime.now(timezone.utc)
    row.last_test_ok = ok
    row.last_test_error = None if ok else message
    db.commit()
    return {"ok": ok, "message": message}
