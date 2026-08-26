"""Encrypt-at-rest for secrets that (unlike a login password) must be
recoverable in plaintext -- e.g. a mailbox password needed to actually
open an IMAP/POP3/SMTP connection later. bcrypt (core/security.py) is
one-way and wrong for this.

The Fernet key is derived from JWT_SECRET_KEY rather than requiring a
second secret in .env -- one production secret to rotate/protect, not
two. Rotating JWT_SECRET_KEY invalidates both sessions and any stored
encrypted secrets at the same time, which is an acceptable, obvious
consequence rather than a silent one.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def _fernet() -> Fernet:
    key = hashlib.sha256(get_settings().JWT_SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored secret could not be decrypted (key changed?).") from exc
