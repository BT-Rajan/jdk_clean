"""Shared sort + paginate helper.

The same "apply a whitelisted sort, then offset/limit, then shape the
result into {items, total, page, page_size, total_pages}" logic was
duplicated near-verbatim across crud/base.py's generic read_all() and the
hand-written list_quotations / list_orders / get_movement_history
services (which can't use BaseCRUD directly because they need joins and
custom response shaping). This module is the single implementation both
styles call into.
"""

from typing import Any

from sqlalchemy.orm import Query


def sort_and_paginate(
    query: Query,
    model: type,
    sortable_fields: dict[str, Any] | list[str],
    sort: str | None,
    page: int = 1,
    page_size: int = 25,
    default_field: str = "id",
) -> dict:
    """Apply `sort` to `query`, paginate it, and return the standard
    PagedResponse dict shared by every list endpoint in the API.

    `sortable_fields` is either:
      - a list of attribute names on `model` (resolved via getattr), used
        by BaseCRUD subclasses whose sortable columns live on the model
        itself, or
      - a dict mapping an external field name to an already-resolved
        SQLAlchemy column, used where the query joins another table or a
        field is renamed for the API (quotations, orders, movements).

    An unrecognised or absent `sort` falls back to `default_field`
    descending. A `model.id` tiebreak is always appended (unless already
    sorting by id) so rows with equal values on the primary sort column
    don't reorder between pages.
    """
    order_columns = []

    if sort:
        direction = "desc" if sort.startswith("-") else "asc"
        field = sort.lstrip("-")
        column = None
        if isinstance(sortable_fields, dict):
            column = sortable_fields.get(field)
        elif field in sortable_fields and hasattr(model, field):
            column = getattr(model, field)
        if column is not None:
            order_columns.append(column.desc() if direction == "desc" else column.asc())

    sorting_by_id = bool(order_columns) and sort is not None and sort.lstrip("-") == "id"

    if not order_columns:
        order_columns.append(getattr(model, default_field).desc())

    if not sorting_by_id and hasattr(model, "id"):
        order_columns.append(model.id.desc())

    query = query.order_by(*order_columns)

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
