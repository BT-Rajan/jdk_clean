from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.product import Product
from app.models.production_execution import ProductionExecution
from app.models.production_order import ProductionOrder
from app.models.qc_agent import QcAgent
from app.models.user import BigPK

QC_REQUEST_STATUSES = ("requested", "sample_sent", "report_received", "accepted", "rejected")

# 'report_pending' from the P7 spec's own diagram is deliberately not a
# stored status -- it's just how 'requested'/'sample_sent' are *labeled*
# to the user before a report exists (see qc_service.fg_release_status),
# not a state anything transitions into on its own. Adding it as a real
# status would need its own manual "mark pending" action that changes
# nothing operationally -- exactly the "unnecessary workflow state" the
# spec's own section 4 says not to introduce.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "requested": {"sample_sent"},
    # A report that already states its conclusion can move straight to
    # accepted/rejected without sitting in 'report_received' first (see
    # qc_service.record_report) -- 'report_received' is for the case the
    # spec explicitly calls out where the report itself has no verdict
    # yet.
    "sample_sent": {"report_received", "accepted", "rejected"},
    "report_received": {"accepted", "rejected"},
    "accepted": set(),
    "rejected": set(),
}


class QcRequest(Base, TimestampMixin):
    """One external QC request against a specific Production Execution --
    never against a whole Production Order (see the P7 spec's "partial/
    batch-based QC" section): two executions under the same Production
    Order can be at entirely different QC stages, and a Production
    Order's own status/lifecycle (P2) is untouched by any of this.

    JDK never performs or interprets the actual testing -- this table
    only tracks the external workflow (sample dispatched, report
    received, and whatever conclusion the lab/agent gives), and gates
    when a run's produced quantity is allowed to become real, releasable
    FinishedGoodsInventory stock (see qc_service._release_execution_fg
    and ProductionExecution.released_quantity's own docstring).

    Reuses the existing generic document-attachment mechanism
    (id_document_service, already shared by customers/suppliers) for the
    report attachment -- id_document_filename/id_verified* here mean
    exactly what they do there (an uploaded file, optionally sign-
    checked by staff afterward), just attached to a QC report instead of
    a KYC document. No new upload/storage code exists for this.

    Reuses the same admin_review_required/admin_reviewed_*/notes columns
    and escalation convention every other overdue-tracking module in
    this app already has (ProductionSchedule, Order, PurchaseOrder) --
    see qc_service.escalate_overdue_qc_requests.
    """

    __tablename__ = "qc_requests"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    qc_request_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    production_order_id: Mapped[int] = mapped_column(BigPK, ForeignKey("production_orders.id"), nullable=False)
    production_execution_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("production_executions.id"), nullable=False
    )
    # Mirrors production_executions.product_id at creation -- same
    # direct-storage convention every table in this chain already uses.
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    qc_agent_id: Mapped[int] = mapped_column(BigPK, ForeignKey("qc_agents.id"), nullable=False)
    # Auto-generated (number_series, doc_type 'QC_SAMPLE') -- the
    # internal reference the P7 spec's "sample tracking" section asks
    # for, unique the same way every other document number in this app
    # is, rather than left to a person to invent and possibly collide.
    sample_reference: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    sample_quantity: Mapped[float | None] = mapped_column(DECIMAL(14, 4), nullable=True)
    request_date: Mapped[date] = mapped_column(DATE, nullable=False)
    expected_report_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*QC_REQUEST_STATUSES, name="qc_request_status"), nullable=False, default="requested"
    )

    # Set by mark_sample_sent.
    dispatch_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    dispatch_method: Mapped[str | None] = mapped_column(String(120), nullable=True)
    external_reference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dispatched_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)

    # Set by record_report -- only ever reachable once (status must be
    # 'sample_sent'), so these are effectively write-once: the P7 spec's
    # "Immutability" section (preserve report number/date, never let a
    # replace happen silently).
    report_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    report_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    received_date: Mapped[date | None] = mapped_column(DATE, nullable=True)

    # Set by record_report or record_result, whichever actually carries
    # the conclusion -- also write-once, since 'accepted'/'rejected' are
    # terminal (ALLOWED_TRANSITIONS above).
    decided_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    decided_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The report attachment -- see this class's own docstring on why
    # these four reuse id_document_service unchanged.
    id_document_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    id_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    id_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    id_verified_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)

    # Overdue-report escalation -- same pattern/columns as
    # ProductionSchedule's own (see that model's docstring).
    admin_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    admin_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_reviewed_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    admin_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    production_order: Mapped[ProductionOrder] = relationship(foreign_keys=[production_order_id], lazy="joined")
    production_execution: Mapped[ProductionExecution] = relationship(
        foreign_keys=[production_execution_id], lazy="joined"
    )
    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")
    qc_agent: Mapped[QcAgent] = relationship(foreign_keys=[qc_agent_id], lazy="joined")
