from pydantic import BaseModel, Field


class SendDocumentEmailRequest(BaseModel):
    to_email: str = Field(min_length=3, max_length=255)
    message: str | None = None
