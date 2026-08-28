from pydantic import BaseModel


class SearchResult(BaseModel):
    entity: str
    entity_label: str
    id: int
    title: str
    subtitle: str | None = None
    url: str
