from sqlalchemy.orm import Session, joinedload

from app.models.deal import STAGE_ORDER, Deal
from app.services import number_series_service

TABLE_NAME = "deals"


def get_deal(db: Session, deal_id: int) -> Deal | None:
    return (
        db.query(Deal)
        .options(joinedload(Deal.customer))
        .filter(Deal.id == deal_id, Deal.deleted_at.is_(None))
        .first()
    )


def get_or_create_for_new_stage(
    db: Session,
    *,
    deal_id: int | None,
    customer_id: int,
    stage: str,
    user_id: int | None = None,
) -> Deal:
    """The loose-grouping rule, in one place: if a deal_id is already
    known (e.g. a quotation created from a feasibility check inherits
    that check's deal), reuse it and bump furthest_stage if this stage is
    further along. Otherwise -- a standalone feasibility check, or a
    standalone quotation with no prior check, or a standalone order with
    neither -- start a new deal right here. Nothing is forced through a
    fixed sequence; whichever stage happens first for a given customer
    request is where its deal begins.
    """
    if deal_id is not None:
        deal = get_deal(db, deal_id)
        if deal is not None:
            if STAGE_ORDER[stage] > STAGE_ORDER[deal.furthest_stage]:
                deal.furthest_stage = stage
                deal.updated_by = user_id
            if deal.status == "cancelled":
                # A new stage attaching to a deal that was written off is
                # clearly moving again -- reopen it.
                deal.status = "open"
                deal.updated_by = user_id
            db.flush()
            return deal

    deal_number = number_series_service.next_number(db, "DEAL")
    deal = Deal(deal_number=deal_number, customer_id=customer_id, furthest_stage=stage, created_by=user_id)
    db.add(deal)
    db.flush()
    return deal


def advance_stage(db: Session, deal_id: int | None, stage: str, user_id: int | None = None) -> None:
    """Bumps furthest_stage on an existing deal without creating anything
    -- used when a later stage (production, delivery) attaches to a deal
    that already exists rather than originating one."""
    if deal_id is None:
        return
    deal = get_deal(db, deal_id)
    if deal is None:
        return
    if STAGE_ORDER[stage] > STAGE_ORDER[deal.furthest_stage]:
        deal.furthest_stage = stage
        deal.updated_by = user_id
        db.flush()


def reopen_deal(db: Session, deal_id: int | None, user_id: int | None = None) -> None:
    """Explicitly reopens a deal (e.g. feasibility_service.revive_feasibility
    calling this when the check it's reviving belongs to a deal that had
    been marked cancelled -- the revived check is a fresh chance for the
    deal, not a dead end anymore)."""
    if deal_id is None:
        return
    deal = get_deal(db, deal_id)
    if deal is None or deal.status != "cancelled":
        return
    deal.status = "open"
    deal.updated_by = user_id
    db.flush()


def reconcile_deal_status(db: Session, deal_id: int | None, user_id: int | None = None) -> None:
    """Called after a feasibility check, quotation, or order under a deal
    terminates negatively (cancelled/rejected/expired/closed) -- checks
    whether *anything* left under the deal could still move it forward,
    and marks the deal 'cancelled' if not. Loose grouping means a deal
    can have several feasibility checks/quotations/orders, so this isn't
    "did the thing that just changed fail" -- it's "is there nothing left
    that could still succeed".

    Deliberately conservative: if the deal has no records under it at all
    yet (shouldn't normally happen, since this is only ever called right
    after something concrete just happened to one), it's left alone
    rather than guessed at.
    """
    if deal_id is None:
        return
    deal = get_deal(db, deal_id)
    if deal is None or deal.status == "cancelled":
        return

    # Local imports: order/quotation/feasibility services all call this
    # function, so importing their models back here at module level for
    # a shared helper avoids expanding the circular-import surface.
    from app.models.feasibility import FeasibilityCheck
    from app.models.order import Order
    from app.models.quotation import Quotation

    orders = db.query(Order).filter(Order.deal_id == deal_id, Order.deleted_at.is_(None)).all()
    quotations = db.query(Quotation).filter(Quotation.deal_id == deal_id, Quotation.deleted_at.is_(None)).all()
    checks = (
        db.query(FeasibilityCheck)
        .filter(FeasibilityCheck.deal_id == deal_id, FeasibilityCheck.deleted_at.is_(None))
        .all()
    )
    if not orders and not quotations and not checks:
        return

    # An order still alive unless cancelled -- anything else (draft
    # through delivered) means the deal succeeded or is still moving.
    if any(o.status != "cancelled" for o in orders):
        return
    # A quotation still alive if it could still become an order.
    if any(q.status in ("draft", "sent", "accepted") for q in quotations):
        return
    # A feasibility check still alive if it could still become a quotation.
    if any(c.status in ("draft", "feasible", "exception_pending", "exception_approved") for c in checks):
        return

    deal.status = "cancelled"
    deal.updated_by = user_id
    db.flush()
