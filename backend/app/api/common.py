from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import ListParams, get_current_user, require_role
from app.core.database import get_db
from app.crud.base import BaseCRUD
from app.models.user import User
from app.services import audit_service


class PagedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    total_pages: int


def build_crud_router(
    *,
    crud: BaseCRUD,
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    out_schema: type[BaseModel],
    prefix: str,
    tags: list[str],
    write_roles: tuple[str, ...] = ("admin", "manager"),
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=tags)
    write_guard = require_role(*write_roles)

    @router.get("", response_model=PagedResponse)
    def list_items(
        params: ListParams = Depends(),
        db: Session = Depends(get_db),
        _: User = Depends(get_current_user),
    ):
        result = crud.read_all(
            db,
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            sort=params.sort,
            filters=params.filters,
        )
        result["items"] = [out_schema.model_validate(i) for i in result["items"]]
        return result

    @router.get("/{item_id}", response_model=out_schema)
    def get_item(
        item_id: int,
        db: Session = Depends(get_db),
        _: User = Depends(get_current_user),
    ):
        return crud.read_one(db, item_id)

    @router.get("/{item_id}/history")
    def get_item_history(
        item_id: int,
        db: Session = Depends(get_db),
        _: User = Depends(get_current_user),
    ):
        crud.read_one(db, item_id, include_deleted=True)  # 404s if it never existed
        return audit_service.get_history(db, crud.table_name, item_id)

    @router.post("", response_model=out_schema, status_code=201)
    def create_item(
        payload: create_schema,
        db: Session = Depends(get_db),
        user: User = Depends(write_guard),
    ):
        return crud.create(db, payload.model_dump(), user_id=user.id)

    @router.put("/{item_id}", response_model=out_schema)
    def update_item(
        item_id: int,
        payload: update_schema,
        db: Session = Depends(get_db),
        user: User = Depends(write_guard),
    ):
        data = payload.model_dump(exclude_unset=True)
        return crud.update(db, item_id, data, user_id=user.id)

    @router.delete("/{item_id}")
    def delete_item(
        item_id: int,
        db: Session = Depends(get_db),
        user: User = Depends(write_guard),
    ):
        crud.delete(db, item_id, user_id=user.id)
        return {"message": "Deleted."}

    @router.post("/{item_id}/restore", response_model=out_schema)
    def restore_item(
        item_id: int,
        db: Session = Depends(get_db),
        user: User = Depends(write_guard),
    ):
        return crud.restore(db, item_id, user_id=user.id)

    return router
