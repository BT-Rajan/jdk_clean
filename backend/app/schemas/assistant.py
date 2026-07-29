from pydantic import BaseModel, Field


class AssistantMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    # Prior turns of this conversation, oldest first -- capped client-side
    # and again server-side (see MAX_HISTORY in assistant_service.py) so a
    # long-running drawer session can't grow the prompt unbounded.
    history: list[AssistantMessage] = Field(default_factory=list)


class AssistantChatResponse(BaseModel):
    reply: str
