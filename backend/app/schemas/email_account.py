from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class EmailAccountOut(BaseModel):
    id: int | None = None
    provider: str
    email_address: str
    display_name: str
    username: str
    has_password: bool  # never the real/masked password itself
    incoming_protocol: str
    imap_host: str
    imap_port: int
    imap_use_ssl: bool
    pop3_host: str
    pop3_port: int
    pop3_use_ssl: bool
    smtp_host: str
    smtp_port: int
    smtp_use_tls: bool
    is_active: bool
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None
    last_test_error: str | None = None


class EmailAccountUpdate(BaseModel):
    provider: str = Field(default="gmail", max_length=20)
    email_address: str = Field(default="", max_length=255)
    display_name: str = Field(default="", max_length=255)
    username: str = Field(default="", max_length=255)
    # Omitted/None keeps the previously saved password (mirrors the
    # masked-ai_api_key convention in settings_service). Empty string
    # explicitly clears it.
    password: str | None = None
    incoming_protocol: str = Field(default="imap", pattern="^(imap|pop3)$")
    imap_host: str = Field(default="imap.gmail.com", max_length=255)
    imap_port: int = Field(default=993, ge=1, le=65535)
    imap_use_ssl: bool = True
    pop3_host: str = Field(default="pop.gmail.com", max_length=255)
    pop3_port: int = Field(default=995, ge=1, le=65535)
    pop3_use_ssl: bool = True
    smtp_host: str = Field(default="smtp.gmail.com", max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_use_tls: bool = True
    is_active: bool = True

    @field_validator("*", mode="before")
    @classmethod
    def _strip_strings(cls, v):
        # Every field here is prone to being copy-pasted -- an app
        # password/host copied from somewhere that displays it with
        # spacing (Google shows app passwords as "abcd efgh ijkl mnop")
        # or a trailing newline would otherwise be saved verbatim and
        # silently break the connection with no validation error.
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _check_encryption_matches_port(self):
        # 993 (IMAP) and 995 (POP3) are IANA-standard implicit-TLS-only
        # ports -- no real mail server accepts a plaintext connection on
        # them, so this combination is never valid, only ever a mistake
        # that would otherwise sit unnoticed until "Test connection" (or
        # a live send) fails with a cryptic "socket error: EOF". Reject
        # it at save time instead, with a message that says exactly
        # what's wrong -- for both directions, since 143/110 are the
        # unencrypted counterparts and don't expect an SSL handshake
        # either.
        if self.incoming_protocol == "imap":
            if self.imap_port == 993 and not self.imap_use_ssl:
                raise ValueError(
                    "IMAP port 993 is SSL/TLS-only -- set Encryption to SSL/TLS, "
                    "or use port 143 for an unencrypted connection."
                )
            if self.imap_port == 143 and self.imap_use_ssl:
                raise ValueError(
                    "IMAP port 143 is not an SSL/TLS port -- set Encryption to "
                    "None, or use port 993 for SSL/TLS."
                )
        else:
            if self.pop3_port == 995 and not self.pop3_use_ssl:
                raise ValueError(
                    "POP3 port 995 is SSL/TLS-only -- set Encryption to SSL/TLS, "
                    "or use port 110 for an unencrypted connection."
                )
            if self.pop3_port == 110 and self.pop3_use_ssl:
                raise ValueError(
                    "POP3 port 110 is not an SSL/TLS port -- set Encryption to "
                    "None, or use port 995 for SSL/TLS."
                )
        return self


class EmailAccountTestResult(BaseModel):
    ok: bool
    message: str
