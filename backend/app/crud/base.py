from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.services import audit_service

ModelType = TypeVar("ModelType")


class BaseCRUD(Generic[ModelType]):
    """Generic CRUD engine shared by every module.

    Subclasses set:
      model              - the SQLAlchemy model class
      table_name          - string name used in the audit log
      searchable_fields   - fields matched by the free-text `search` param
      sortable_fields     - fields allowed in the `sort` param (whitelist)
      filterable_fields   - fields allowed in the `filters` dict (whitelist)
    """

    model: type[ModelType]
    table_name: str
    searchable_fields: list[str] = []
    sortable_fields: list[str] = ["id", "created_at"]
    filterable_fields: list[str] = []

    def _base_query(self, db: Session, include_deleted: bool = False):
        query = db.query(self.model)
        if not include_deleted and hasattr(self.model, "deleted_at"):
            query = query.filter(self.model.deleted_at.is_(None))
        return query

    def read_one(self, db: Session, id: int, include_deleted: bool = False) -> ModelType:
        obj = self._base_query(db, include_deleted).filter(self.model.id == id).first()
        if obj is None:
            raise NotFoundError(self.model.__name__)
        return obj

    def read_all(
        self,
        db: Session,
        page: int = 1,
        page_size: int = 25,
        search: str | None = None,
        sort: str | None = None,
        filters: dict[str, Any] | None = None,
    ) -> dict:
        query = self._base_query(db)

        if search and self.searchable_fields:
            like = f"%{search}%"
            conditions = [
                getattr(self.model, f).ilike(like)
                for f in self.searchable_fields
                if hasattr(self.model, f)
            ]
            if conditions:
                query = query.filter(or_(*conditions))

        if filters:
            for field, value in filters.items():
                if field in self.filterable_fields and hasattr(self.model, field):
                    query = query.filter(getattr(self.model, field) == value)

        if sort:
            direction = "desc" if sort.startswith("-") else "asc"
            field = sort.lstrip("-")
            if field in self.sortable_fields and hasattr(self.model, field):
                column = getattr(self.model, field)
                query = query.order_by(column.desc() if direction == "desc" else column.asc())
        else:
            query = query.order_by(self.model.id.desc())

        total = query.count()
        page = max(page, 1)
        page_size = min(max(page_size, 1), 200)
        items = query.offset((page - 1) * page_size).limit(page_size).all()

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        }

    def create(self, db: Session, data: dict, user_id: int | None = None) -> ModelType:
        if hasattr(self.model, "created_by"):
            data = {**data, "created_by": user_id}
        obj = self.model(**data)
        db.add(obj)
        db.flush()  # populate obj.id without committing
        audit_service.log_create(db, self.table_name, obj.id, user_id)
        db.commit()
        db.refresh(obj)
        return obj

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> ModelType:
        obj = self.read_one(db, id)
        changes: dict[str, tuple] = {}
        for field, new_value in data.items():
            if hasattr(obj, field):
                old_value = getattr(obj, field)
                if old_value != new_value:
                    changes[field] = (old_value, new_value)
                    setattr(obj, field, new_value)
        if hasattr(obj, "updated_by"):
            obj.updated_by = user_id
        audit_service.log_update(db, self.table_name, id, changes, user_id)
        db.commit()
        db.refresh(obj)
        return obj

    def delete(self, db: Session, id: int, user_id: int | None = None) -> None:
        """Soft delete: sets deleted_at rather than removing the row."""
        obj = self.read_one(db, id)
        if hasattr(obj, "deleted_at"):
            obj.deleted_at = datetime.now(timezone.utc)
        else:
            db.delete(obj)
        audit_service.log_delete(db, self.table_name, id, user_id)
        db.commit()

    def restore(self, db: Session, id: int, user_id: int | None = None) -> ModelType:
        obj = self.read_one(db, id, include_deleted=True)
        if hasattr(obj, "deleted_at"):
            obj.deleted_at = None
        audit_service.log_restore(db, self.table_name, id, user_id)
        db.commit()
        db.refresh(obj)
        return obj

    def bulk_create(self, db: Session, records: list[dict], user_id: int | None = None) -> list[ModelType]:
        objs = []
        for data in records:
            if hasattr(self.model, "created_by"):
                data = {**data, "created_by": user_id}
            obj = self.model(**data)
            db.add(obj)
            objs.append(obj)
        db.flush()
        for obj in objs:
            audit_service.log_create(db, self.table_name, obj.id, user_id)
        db.commit()
        for obj in objs:
            db.refresh(obj)
        return objs
