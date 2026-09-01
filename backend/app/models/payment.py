from datetime import date

from sqlalchemy import DATE, DECIMAL, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.order import Order
from app.models.user import BigPK, User


class Payment(Base, TimestampMixin, SoftDeleteMixin):
    """A payment recorded against one order -- e.g. a bank transfer or
    cheque confirmed to have actually arrived, entered by hand once
    someone's checked it landed (see payment_service.py). There's no
    online payment collection yet -- the money moves outside the app
    (bank transfer, cheque, cash, a payment link sent separately) and
    this is the record of that, not the transaction itself.

    created_by (from TimestampMixin) is who recorded it, not who paid.
    Soft-deletable rather than editable -- correcting a wrongly-entered
    payment means reversing it and recording a fresh one, keeping the
    same "never silently rewrite a financial entry" stance the rest of
    this app takes with completed production/shipped orders.
    """

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    order_id: Mapped[int] = mapped_column(BigPK, ForeignKey("orders.id"), nullable=False)
    # Denormalized from order.customer_id at creation, purely so a
    # customer's total outstanding balance can be computed with one
    # query instead of joining through orders every time.
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(DATE, nullable=False)
    # Free text -- "Bank transfer", "Cheque", "Cash", "Card", ... no
    # fixed set since how a customer actually pays isn't constrained by
    # this app in any way (no gateway integration yet).
    method: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Bank reference / cheque number / transaction id -- whatever ties
    # this back to the real money movement outside the app.
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order] = relationship(lazy="joined")
    customer: Mapped[Customer] = relationship(lazy="joined")
    creator: Mapped[User | None] = relationship(foreign_keys="Payment.created_by", lazy="joined")
