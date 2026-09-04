from pydantic import BaseModel, Field


class SendDocumentEmailRequest(BaseModel):
    to_email: str = Field(min_length=3, max_length=255)
    message: str | None = None
    # Some recipients' mail gateways silently quarantine PDF attachments
    # from unfamiliar senders -- this lets a document be sent as plain
    # body text only, to work around that or just when no attachment is
    # wanted.
    attach_pdf: bool = True


class EmailPreviewOut(BaseModel):
    """The subject/body an email-send action would use right now, for
    the compose dialog to show before the user commits to sending --
    e.g. picking between a document's first-send and already-sent-before
    template."""
    to_email: str | None = None
    subject: str
    body: str
