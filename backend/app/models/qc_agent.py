from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK


class QcAgent(Base, TimestampMixin, SoftDeleteMixin):
    """An external testing laboratory/agent -- JDK never performs the
    actual testing itself (see docs/production-lifecycle.md's P7 note),
    this is only enough identity to say which lab a QC request went to.

    Deliberately its own small master rather than reusing Supplier: a
    lab isn't a raw-material vendor, and Supplier carries a lot that
    would be meaningless here (payment_terms_days, po_approval_threshold_
    override, mode_of_supply, the onboarding/ID-verification wizard) --
    forcing labs into that table would drag all of it along and confuse
    the existing Suppliers list with an unrelated kind of record. This
    mirrors Machine's own shape instead: a single-purpose master with no
    onboarding workflow, same "keep it minimal" instruction the P7 spec
    itself gives for external QC agents.
    """

    __tablename__ = "qc_agents"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="qc_agent_status"), nullable=False, default="active"
    )
