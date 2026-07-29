from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK

# Purely descriptive -- "how far has this deal gotten" for display, not a
# gate. A deal can skip stages entirely (e.g. a repeat customer's order
# created with no feasibility check or quotation at all).
DEAL_STAGES = ("feasibility", "quotation", "order", "production", "delivery")
STAGE_ORDER = {stage: i for i, stage in enumerate(DEAL_STAGES)}


class Deal(Base, TimestampMixin, SoftDeleteMixin):
    """Loose grouping tying one customer request's feasibility check,
    quotation(s), and order together via deal_id on each of those tables.
    Loose on purpose: whichever stage is created first (feasibility, or a
    standalone quotation, or a standalone order) with no deal_id given
    creates one -- nothing requires every deal to pass through every
    stage. See deal_service.get_or_create_for_new_stage.
    """

    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    deal_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    furthest_stage: Mapped[str] = mapped_column(
        Enum(*DEAL_STAGES, name="deal_stage"), nullable=False, default="feasibility"
    )

    customer: Mapped[Customer] = relationship(lazy="joined")
