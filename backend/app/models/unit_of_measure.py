from sqlalchemy import DECIMAL, Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK

UOM_CATEGORIES = ("weight", "count", "volume")


class UnitOfMeasure(Base, TimestampMixin, SoftDeleteMixin):
    """Admin-managed unit list (kg / ton / bag / ...) that BOM lines and
    raw materials both draw their `unit` value from, so a BOM quantity
    expressed in one unit can be converted into whatever unit a raw
    material's stock is tracked in -- see
    bom_service.explode_requirements, which is where factor_to_base is
    actually used.

    `unit` on bom_lines and raw_materials stays a plain string column
    (not a FK) rather than adding a migration across both tables --
    this table is instead the source of truth those strings are
    validated against (bom_service, RawMaterialCRUD) and looked up in
    at calculation time. Legacy rows whose `unit` predates this table
    and doesn't match any code here are left alone and treated as
    unconvertible (factor 1, i.e. today's behavior), not rejected.
    """

    __tablename__ = "units_of_measure"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    category: Mapped[str] = mapped_column(Enum(*UOM_CATEGORIES, name="uom_category"), nullable=False)
    # How many of this category's base unit (the row with is_base=True in
    # the same category) one unit of THIS row equals. The base unit's own
    # factor_to_base is always 1. E.g. weight: kg is_base factor=1,
    # ton factor=1000, bag factor=50 (a configurable assumption -- see
    # migration comment).
    factor_to_base: Mapped[float] = mapped_column(DECIMAL(14, 6), nullable=False, default=1)
    is_base: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="uom_status"), nullable=False, default="active"
    )
