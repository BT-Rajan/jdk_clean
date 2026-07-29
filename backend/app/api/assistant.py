from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.assistant import AssistantChatRequest, AssistantChatResponse
from app.services import assistant_service

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantChatResponse)
def chat(
    payload: AssistantChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        reply = assistant_service.chat(
            db,
            current_user,
            payload.message,
            [m.model_dump() for m in payload.history],
        )
    except assistant_service.AssistantNotConfigured:
        return AssistantChatResponse(
            reply="The AI assistant isn't set up yet — an admin needs to add an AI "
            "provider and API key in Settings."
        )
    return AssistantChatResponse(reply=reply)
