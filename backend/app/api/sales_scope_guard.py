"""Router-level dependency enforcing salesman customer ownership on every
{order_id}/{quotation_id}/{feasibility_id}/{note_id}/{deal_id} route of the
sales routers. See app/core/sales_scope.py for the rule."""

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.sales_scope import PATH_PARAM_RESOLVERS, customer_in_scope, is_scoped_salesman
from app.models.user import User


def sales_record_scope_guard(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """A scoped salesman may only touch a record whose customer is assigned
    to them; anything else 404s (not 403 -- another salesman's record ids
    must not even be probeable). A record that doesn't exist is left for
    the handler's own 404."""
    if not is_scoped_salesman(user):
        return
    for param, (resolver, label) in PATH_PARAM_RESOLVERS.items():
        raw = request.path_params.get(param)
        if raw is None:
            continue
        try:
            record_id = int(raw)
        except (TypeError, ValueError):
            continue
        customer_id = resolver(db, record_id)
        if customer_id is not None and not customer_in_scope(db, user, customer_id):
            raise NotFoundError(label)
