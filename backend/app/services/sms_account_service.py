"""Communication module, SMS channel: the one admin-configured bulk SMS
account, sending through one of Kuwait's common gateway operators (or a
custom HTTP endpoint). Only one row ever exists in practice -- `_row`
below always returns/creates a single row rather than a list, same
pattern as email_account_service.

Uses only the standard library (urllib), matching email_service.py's
own stated dependency-light philosophy -- these are plain HTTP calls,
no SDK needed for any of them.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.exceptions import ValidationAppError
from app.models.sms_account import SmsAccount

# Known operator presets -- the frontend shows these as picker options
# and fills the API URL on selection; "custom" leaves it blank for the
# admin to type. kwtSMS is Kuwait's own dedicated gateway (operating
# since 2007) and is the default; Unifonic and SMSala are the two other
# gateways most commonly used by businesses sending bulk SMS in Kuwait.
PROVIDER_PRESETS: dict[str, dict] = {
    "kwtsms": {
        "label": "kwtSMS (Kuwait)",
        "api_url": "https://www.kwtsms.com/API/send/",
        "username_label": "API username",
        "secret_label": "API password",
        "note": "Kuwait's own bulk SMS gateway. Has a built-in test mode that queues without delivering.",
    },
    "unifonic": {
        "label": "Unifonic",
        "api_url": "https://el.cloud.unifonic.com/rest/SMS/messages",
        "username_label": "App SID",
        "secret_label": "Auth token (leave blank if not required)",
        "note": "Widely used across the GCC. Sender ID must be pre-registered with Unifonic.",
    },
    "smsala": {
        "label": "SMSala",
        "api_url": "https://api.smsala.com/api/SendSMS",
        "username_label": "API ID",
        "secret_label": "API password",
        "note": "",
    },
    "custom": {
        "label": "Custom / other",
        "api_url": "",
        "username_label": "Username / API ID",
        "secret_label": "Password / API secret",
        "note": "Sends a generic JSON POST ({username, password, sender, mobile, message}) to the URL you provide.",
    },
}


def _row(db: Session) -> SmsAccount:
    row = db.query(SmsAccount).order_by(SmsAccount.id.asc()).first()
    if row is None:
        row = SmsAccount(provider="kwtsms", api_url=PROVIDER_PRESETS["kwtsms"]["api_url"])
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: SmsAccount) -> dict:
    return {
        "id": row.id,
        "provider": row.provider,
        "sender_id": row.sender_id,
        "api_url": row.api_url,
        "api_username": row.api_username,
        "has_secret": bool(row.api_password_encrypted),
        "test_mode": row.test_mode,
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
    row.sender_id = data["sender_id"]
    row.api_url = data["api_url"] or PROVIDER_PRESETS.get(data["provider"], {}).get("api_url", "")
    row.api_username = data["api_username"]
    row.test_mode = data["test_mode"]
    row.is_active = data["is_active"]
    row.updated_by = user_id

    secret = data.get("api_secret")
    if secret is not None:
        row.api_password_encrypted = encrypt_secret(secret) if secret else None

    # Config changed -- the last test result no longer speaks to the
    # current settings.
    row.last_tested_at = None
    row.last_test_ok = None
    row.last_test_error = None

    db.commit()
    db.refresh(row)
    return _to_out(row)


def _get_secret(row: SmsAccount) -> str:
    if not row.api_password_encrypted:
        return ""
    return decrypt_secret(row.api_password_encrypted)


def _request(url: str, *, method: str, data: bytes, headers: dict) -> tuple[int, str]:
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def _send_kwtsms(row: SmsAccount, secret: str, to_number: str, message: str) -> dict:
    payload = {
        "username": row.api_username,
        "password": secret,
        "sender": row.sender_id,
        "mobile": to_number,
        "message": message,
        "test": "1" if row.test_mode else "0",
    }
    status, body = _request(
        row.api_url,
        method="POST",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        parsed = json.loads(body)
    except ValueError:
        return {"ok": False, "message": f"kwtSMS returned an unexpected response (HTTP {status}): {body[:200]}"}
    if str(parsed.get("result", "")).upper() == "OK":
        note = " (test mode -- queued, not delivered)" if row.test_mode else ""
        return {"ok": True, "message": f"Message accepted, id {parsed.get('msg-id', '?')}{note}"}
    return {"ok": False, "message": f"kwtSMS error: {parsed.get('code', parsed)}"}


def _send_unifonic(row: SmsAccount, secret: str, to_number: str, message: str) -> dict:
    payload = {
        "AppSid": row.api_username,
        "SenderID": row.sender_id,
        "Body": message,
        "Recipient": to_number,
        "responseType": "JSON",
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
    if secret:
        headers["Authorization"] = f"Bearer {secret}"
    status, body = _request(
        row.api_url, method="POST", data=urllib.parse.urlencode(payload).encode(), headers=headers,
    )
    try:
        parsed = json.loads(body)
    except ValueError:
        return {"ok": False, "message": f"Unifonic returned an unexpected response (HTTP {status}): {body[:200]}"}
    success = parsed.get("success")
    if success is True or (isinstance(parsed.get("data"), dict) and parsed["data"].get("MessageID")):
        return {"ok": True, "message": "Message accepted by Unifonic."}
    error_msg = parsed.get("message") or parsed.get("errors") or parsed
    return {"ok": False, "message": f"Unifonic error: {error_msg}"}


def _send_smsala(row: SmsAccount, secret: str, to_number: str, message: str) -> dict:
    params = {
        "api_id": row.api_username,
        "api_password": secret,
        "sms_type": "T",
        "encoding": "T",
        "sender_id": row.sender_id,
        "phonenumber": to_number,
        "textmessage": message,
    }
    url = f"{row.api_url}?{urllib.parse.urlencode(params)}"
    status, body = _request(url, method="GET", data=b"", headers={"Accept": "application/json"})
    try:
        parsed = json.loads(body)
    except ValueError:
        return {"ok": False, "message": f"SMSala returned an unexpected response (HTTP {status}): {body[:200]}"}
    if parsed.get("status") == "S":
        return {"ok": True, "message": f"Message accepted, id {parsed.get('message_id', '?')}"}
    return {"ok": False, "message": f"SMSala error: {parsed.get('remarks', parsed)}"}


def _send_custom(row: SmsAccount, secret: str, to_number: str, message: str) -> dict:
    if not row.api_url:
        return {"ok": False, "message": "Enter an API URL for the custom endpoint first."}
    payload = {
        "username": row.api_username,
        "password": secret,
        "sender": row.sender_id,
        "mobile": to_number,
        "message": message,
    }
    status, body = _request(
        row.api_url,
        method="POST",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    ok = 200 <= status < 300
    return {"ok": ok, "message": f"HTTP {status}: {body[:300]}"}


_SENDERS = {
    "kwtsms": _send_kwtsms,
    "unifonic": _send_unifonic,
    "smsala": _send_smsala,
    "custom": _send_custom,
}


def send_sms(db: Session, to_number: str, message: str) -> dict:
    """Sends a real message through the configured provider. Never
    raises for a provider-side failure -- network/HTTP errors and
    provider error responses both come back as {"ok": False, ...}."""
    row = _row(db)
    if not row.sender_id:
        return {"ok": False, "message": "Set a sender ID first."}
    if not row.api_url:
        return {"ok": False, "message": "Set an API URL first."}
    try:
        secret = _get_secret(row)
    except ValueError as exc:
        return {"ok": False, "message": str(exc)}

    sender = _SENDERS.get(row.provider)
    if sender is None:
        raise ValidationAppError(f"Unknown SMS provider '{row.provider}'.")

    try:
        return sender(row, secret, to_number, message)
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        return {"ok": False, "message": f"Could not reach {row.provider}: {exc}"}


def test_connection(db: Session, phone_number: str) -> dict:
    """Sends a real test SMS to `phone_number` through the configured
    provider (kwtSMS's test_mode, when on, queues it without actually
    delivering to the handset -- every other provider/mode sends for
    real and will use SMS credit)."""
    result = send_sms(db, phone_number, "Test message from your ERP's Communication settings.")
    row = _row(db)
    row.last_tested_at = datetime.now(timezone.utc)
    row.last_test_ok = result["ok"]
    row.last_test_error = None if result["ok"] else result["message"]
    db.commit()
    return result
