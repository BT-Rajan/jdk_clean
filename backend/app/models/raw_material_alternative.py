from sqlalchemy import DECIMAL, Enum, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.raw_material import RawMaterial
from app.models.user import BigPK


class RawMaterialAlternative(Base, TimestampMixin, SoftDeleteMixin):
    """An approved substitute for a raw material -- e.g. "if we run out of
    material #1, material #2 can be used instead, at this conversion
    ratio". Directed on purpose (a premium material may substitute for a
    standard one without the reverse being true), so this is a real row
    per direction, not a symmetric pairing table.

    Two FKs to the same table (raw_materials), same shape as
    supplier_materials' two FKs to different tables -- just both ends
    happen to point at RawMaterial here.
    """

    __tablename__ = "raw_material_alternatives"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    raw_material_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("raw_materials.id"), nullable=False
    )
    alternative_material_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("raw_materials.id"), nullable=False
    )
    priority: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        Enum("approved", "blocked", name="raw_material_alternative_status"),
        nullable=False,
        default="approved",
    )
    # How much of the alternative replaces 1 unit of the primary material
    # (e.g. 1.5 means 1.5 units of the alternative are needed per unit of
    # the primary). Defaults to a straight 1:1 swap.
    conversion_ratio: Mapped[float] = mapped_column(DECIMAL(14, 6), nullable=False, default=1)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    raw_material: Mapped[RawMaterial] = relationship(foreign_keys=[raw_material_id], lazy="joined")
    alternative_material: Mapped[RawMaterial] = relationship(
        foreign_keys=[alternative_material_id], lazy="joined"
    )
