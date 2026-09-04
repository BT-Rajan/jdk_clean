from datetime import date

from sqlalchemy import DATE, DECIMAL, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.order import Order
from app.models.user import BigPK, User


class PaymentPlan(Base, TimestampMixin, SoftDeleteMixin):
    """A recorded commitment to pay an order off over time -- e.g. "agreed
    by phone: full amount by the 30th" -- entered by hand once Sales has
    that agreement, same "the money/commitment happens outside the app,
    this is the record of it" spirit as Payment. Deliberately just one
    commitment record (amount + a single target date) for now, not a
    full per-installment schedule -- see payment_plan_service.py.

    Purely informational: unlike an actual Payment, a plan does NOT
    reduce what counts against the customer's credit limit in
    order_service.change_status -- confirming an order still needs
    either the balance actually paid down or an admin's manual
    approve_order override. This exists so that "yes, we have a plan
    with them" is on record and visible on the order, not to unblock
    confirmation by itself.

    created_by (from TimestampMixin) is who recorded it, not who agreed
    to it. Soft-deletable rather than editable, same "never silently
    rewrite a financial entry" stance as Payment: correcting a wrongly
    recorded plan means reversing it and recording a fresh one.
    """

    __tablename__ = "payment_plans"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    order_id: Mapped[int] = mapped_column(BigPK, ForeignKey("orders.id"), nullable=False)
    # Denormalized from order.customer_id at creation, same reason as Payment.
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)
    # The single date this amount is committed to be settled by.
    target_date: Mapped[date] = mapped_column(DATE, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order] = relationship(lazy="joined")
    customer: Mapped[Customer] = relationship(lazy="joined")
    creator: Mapped[User | None] = relationship(foreign_keys="PaymentPlan.created_by", lazy="joined")
