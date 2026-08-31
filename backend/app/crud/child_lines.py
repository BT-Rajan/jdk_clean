"""Generic engine for a master's "child line list" pattern: a parent
record (Product, Supplier) owns a set of child rows edited as a unit
(PUT replaces the whole list) or incrementally (POST one line, DELETE
one line) -- BOM lines, packaging lines, and supplier-material lines are
all exactly this shape. app/services/bom_service.py,
app/services/packaging_service.py, and app/services/supplier_material_service.py
used to each hand-roll the same soft-delete-then-reinsert /
duplicate-check / parent-keyed-audit logic independently (down to
identical docstrings); this is the one implementation, and those three
services now each hold a thin ChildLineCRUD subclass plus whatever
domain-specific validation and computation is actually theirs (BOM's
cycle/unit checks and requirement explosion, in particular, stay in
bom_service.py -- that logic isn't shared with the other two and
shouldn't be forced into this generic layer).

Every mutation is audited against the *parent's* id, not the child row's
own id, so a parent's full line history reads as one timeline in
app/services/audit_service.get_history -- same convention every
hand-rolled version already followed, preserved here.
"""

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.services import audit_service

ModelType = TypeVar("ModelType")


class ChildLineCRUD(Generic[ModelType]):
    """Subclasses set:
      model          - the SQLAlchemy model class for a child line
      table_name     - string name used in the audit log
      parent_field   - the FK column name on `model` pointing at the
                       parent (e.g. "product_id", "supplier_id")
      parent_model    - the SQLAlchemy model class for the parent
      parent_label    - resource name used in the 404 message when the
                        parent doesn't exist (default "Parent")

    and override, where the child line needs it:
      _validate_line(db, parent_id, line)  - raise ValidationAppError/
          ConflictError for anything domain-specific. No-op by default.
      _duplicate_filter(parent_id, line)   - list of SQLAlchemy filter
          clauses identifying "the same line" for add_line's duplicate
          check. Empty list (no check) by default.
      _resolve_labels(db, lines)           - attach any dynamic display
          attributes the response schema reads (e.g. component_code).
          No-op by default.
    """

    model: type[ModelType]
    table_name: str
    parent_field: str
    parent_model: type
    parent_label: str = "Parent"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        pass

    def _duplicate_filter(self, parent_id: int, line: dict) -> list[Any]:
        return []

    def _resolve_labels(self, db: Session, lines: list[ModelType]) -> None:
        pass

    def _get_active_parent(self, db: Session, parent_id: int):
        parent = (
            db.query(self.parent_model)
            .filter(self.parent_model.id == parent_id, self.parent_model.deleted_at.is_(None))
            .first()
        )
        if parent is None:
            raise NotFoundError(self.parent_label)
        return parent

    def _active_lines_query(self, db: Session, parent_id: int):
        return db.query(self.model).filter(
            getattr(self.model, self.parent_field) == parent_id, self.model.deleted_at.is_(None)
        )

    def get_lines(self, db: Session, parent_id: int) -> list[ModelType]:
        self._get_active_parent(db, parent_id)
        lines = self._active_lines_query(db, parent_id).order_by(self.model.id).all()
        self._resolve_labels(db, lines)
        return lines

    def replace_lines(
        self, db: Session, parent_id: int, lines: list[dict], user_id: int | None = None
    ) -> list[ModelType]:
        self._get_active_parent(db, parent_id)
        for line in lines:
            self._validate_line(db, parent_id, line)

        existing = self._active_lines_query(db, parent_id).all()
        now = datetime.now(timezone.utc)
        for row in existing:
            row.deleted_at = now

        new_rows = [self.model(**{self.parent_field: parent_id}, created_by=user_id, **line) for line in lines]
        db.add_all(new_rows)
        db.flush()
        audit_service.log_update(
            db,
            self.table_name,
            parent_id,
            {"lines": (f"{len(existing)} line(s)", f"{len(new_rows)} line(s)")},
            user_id,
        )
        db.commit()
        return self.get_lines(db, parent_id)

    def add_line(self, db: Session, parent_id: int, line: dict, user_id: int | None = None) -> ModelType:
        self._get_active_parent(db, parent_id)
        self._validate_line(db, parent_id, line)

        filters = self._duplicate_filter(parent_id, line)
        if filters and self._active_lines_query(db, parent_id).filter(*filters).first() is not None:
            raise ConflictError("This is already on the list; edit that line instead.")

        row = self.model(**{self.parent_field: parent_id}, created_by=user_id, **line)
        db.add(row)
        db.flush()
        # Keyed by parent_id (not row.id) -- see module docstring.
        audit_service.log_create(db, self.table_name, parent_id, user_id)
        db.commit()
        self._resolve_labels(db, [row])
        return row

    def delete_line(self, db: Session, parent_id: int, line_id: int, user_id: int | None = None) -> None:
        row = (
            db.query(self.model)
            .filter(
                self.model.id == line_id,
                getattr(self.model, self.parent_field) == parent_id,
                self.model.deleted_at.is_(None),
            )
            .first()
        )
        if row is None:
            raise NotFoundError("Line")
        row.deleted_at = datetime.now(timezone.utc)
        audit_service.log_delete(db, self.table_name, parent_id, user_id)
        db.commit()
