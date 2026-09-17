from pydantic import BaseModel


class ReconciliationExceptionOut(BaseModel):
    """One row of the compact reconciliation report -- see
    reconciliation_service.get_exceptions for what each field means and
    which invariant it checks."""

    area: str
    document: str
    product_or_material: str
    expected: float
    actual: float
    difference: float
    status: str
    kind: str
