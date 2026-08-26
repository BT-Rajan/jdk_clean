"""Communication module, WhatsApp channel: the one admin-configured
Meta WhatsApp Business Cloud API sender.

Template-only by design -- there is no function here that sends
free-form text, and none should ever be added. `list_templates` fetches
the account's currently APPROVED templates directly from Meta; `send_template`
only accepts a template name/language, never a message body, so the
only thing that can ever go out is something Meta has already reviewed
and approved for this WABA.

Uses only the standard library (urllib) -- a handful of plain REST
calls to the Graph API, same dependency-light approach as
email_account_service and sms_account_service.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.whatsapp_account import WhatsAppAccount

GRAPH_HOST = "https://graph.facebook.com"


def _row(db: Session) -> WhatsAppAccount:
    row = db.query(WhatsAppAccount).order_by(WhatsAppAccount.id.asc()).first()
    if row is None:
        row = WhatsAppAccount()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: WhatsAppAccount) -> dict:
    return {
        "id": row.id,
        "phone_number_id": row.phone_number_id,
        "waba_id": row.waba_id,
        "display_phone_number": row.display_phone_number,
        "verified_name": row.verified_name,
        "has_token": bool(row.access_token_encrypted),
        "api_version": row.api_version,
        "is_active": row.is_active,
        "last_tested_at": row.last_tested_at,
        "last_test_ok": row.last_test_ok,
        "last_test_error": row.last_test_error,
    }


def get(db: Session) -> dict:
    return _to_out(_row(db))


def update(db: Session, data: dict, user_id: int) -> dict:
    row = _row(db)
    row.phone_number_id = data["phone_number_id"]
    row.waba_id = data["waba_id"]
    row.api_version = data["api_version"] or "v21.0"
    row.is_active = data["is_active"]
    row.updated_by = user_id

    token = data.get("access_token")
    if token is not None:
        row.access_token_encrypted = encrypt_secret(token) if token else None

    # Config changed -- clear the stale verification result and any
    # Meta-reported identity, which no longer necessarily matches.
    row.display_phone_number = ""
    row.verified_name = ""
    row.last_tested_at = None
    row.last_test_ok = None
    row.last_test_error = None

    db.commit()
    db.refresh(row)
    return _to_out(row)


def _token(row: WhatsAppAccount) -> str:
    if not row.access_token_encrypted:
        raise ValueError("Set the Meta access token before using this channel.")
    return decrypt_secret(row.access_token_encrypted)


def _graph_get(path: str, token: str, params: dict | None = None) -> tuple[int, dict | str]:
    url = f"{GRAPH_HOST}/{path.lstrip('/')}"
    if params:
        url += f"?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return _call(req)


def _graph_post(path: str, token: str, body: dict) -> tuple[int, dict | str]:
    url = f"{GRAPH_HOST}/{path.lstrip('/')}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    return _call(req)


def _call(req: urllib.request.Request) -> tuple[int, dict | str]:
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        status = exc.code
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        return 0, f"Could not reach Meta: {exc}"
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, raw


def _meta_error(body: dict | str) -> str:
    if isinstance(body, dict):
        err = body.get("error", {})
        return str(err.get("message") or body)
    return str(body)[:300]


def test_connection(db: Session) -> dict:
    """Read-only credential check -- fetches this phone number's own
    record from Meta (display name, verification status). Sends
    nothing, costs nothing, unlike the email/SMS test paths."""
    row = _row(db)
    if not row.phone_number_id:
        return _record_test(db, row, False, "Enter a Phone Number ID first.")
    try:
        token = _token(row)
    except ValueError as exc:
        return _record_test(db, row, False, str(exc))

    status, body = _graph_get(
        f"/{row.api_version}/{row.phone_number_id}",
        token,
        params={"fields": "display_phone_number,verified_name,code_verification_status"},
    )
    if status != 200 or not isinstance(body, dict):
        return _record_test(db, row, False, f"Meta rejected the credentials: {_meta_error(body)}")

    row.display_phone_number = body.get("display_phone_number", "")
    row.verified_name = body.get("verified_name", "")
    verification = body.get("code_verification_status", "")
    note = f" (number verification: {verification})" if verification else ""
    return _record_test(
        db, row, True,
        f"Connected as {row.verified_name or row.display_phone_number or row.phone_number_id}{note}.",
    )


def _record_test(db: Session, row: WhatsAppAccount, ok: bool, message: str) -> dict:
    row.last_tested_at = datetime.now(timezone.utc)
    row.last_test_ok = ok
    row.last_test_error = None if ok else message
    db.commit()
    return {"ok": ok, "message": message}


def list_templates(db: Session) -> list[dict]:
    """Live list of this WABA's APPROVED templates from Meta -- the
    admin picks a send target from this list; nothing here is typed by
    hand, so what shows up here is exactly and only what's actually
    approved right now."""
    row = _row(db)
    if not row.waba_id or not row.access_token_encrypted:
        return []
    token = _token(row)
    status, body = _graph_get(
        f"/{row.api_version}/{row.waba_id}/message_templates",
        token,
        params={"fields": "name,language,category,status,components", "limit": "100"},
    )
    if status != 200 or not isinstance(body, dict):
        return []

    templates = []
    for tpl in body.get("data", []):
        if tpl.get("status") != "APPROVED":
            continue
        components = []
        for comp in tpl.get("components", []):
            text = comp.get("text", "")
            components.append({
                "type": comp.get("type", ""),
                "text": text or None,
                "variable_count": text.count("{{") if text else 0,
            })
        templates.append({
            "name": tpl.get("name", ""),
            "language": tpl.get("language", ""),
            "category": tpl.get("category", ""),
            "status": tpl.get("status", ""),
            "components": components,
        })
    return templates


def send_template(db: Session, to_number: str, template_name: str, language: str, body_params: list[str]) -> dict:
    """Sends exactly one template message. `template_name`/`language`
    must match something Meta has approved -- Meta itself enforces this
    and rejects anything else, but the field is also never populated
    from free text in the UI, only from list_templates' own output.
    Header/footer variables aren't supported here, only BODY params."""
    row = _row(db)
    if not row.phone_number_id:
        return {"ok": False, "message": "Set a Phone Number ID first."}
    try:
        token = _token(row)
    except ValueError as exc:
        return {"ok": False, "message": str(exc)}

    components = []
    if body_params:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": v} for v in body_params],
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            **({"components": components} if components else {}),
        },
    }
    status, body = _graph_post(f"/{row.api_version}/{row.phone_number_id}/messages", token, payload)
    if status == 200 and isinstance(body, dict) and body.get("messages"):
        msg_id = body["messages"][0].get("id", "?")
        return {"ok": True, "message": f"Sent, message id {msg_id}."}
    return {"ok": False, "message": f"Meta rejected the send: {_meta_error(body)}"}
