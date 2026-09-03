from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.user import BigPK


class DocTemplate(Base, TimestampMixin):
    """An admin-uploaded .docx template overriding the bundled default for
    one (doc_type, language) pair -- see doc_template_service.py. A row
    only exists once someone has actually uploaded a replacement; no row
    for a given pair means "use the bundled default asset" (same
    absence-means-default idea as company_logo_service's Setting rows),
    so a fresh install needs no seed data here either.
    """

    __tablename__ = "doc_templates"
    __table_args__ = (UniqueConstraint("doc_type", "language", name="uq_doc_templates_type_lang"),)

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False)
    language: Mapped[str] = mapped_column(String(5), nullable=False)
    # Stored filename on disk (uuid-based, see doc_template_service.py) --
    # distinct from original_filename, which is only ever shown back to
    # the admin, never used to build a path.
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
