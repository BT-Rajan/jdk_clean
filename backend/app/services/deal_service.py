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
