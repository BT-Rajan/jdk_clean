from pydantic import BaseModel


class SalesHomeCounts(BaseModel):
    customers: int
    open_feasibility: int
    open_quotations: int
    active_orders: int
    attention: int


class SalesAttentionItem(BaseModel):
    kind: str
    title: str
    detail: str
    customer_name: str
    link: str


class SalesmanWorkloadRow(BaseModel):
    """One row of the manager's workload table. user_id is None for the
    'Unassigned' row (customers nobody owns yet)."""

    user_id: int | None
    name: str
    customers: int
    open_quotations: int
    active_orders: int
    attention: int


class SalesHomeOut(BaseModel):
    # 'own'  -> a salesman: everything below is their customers only.
    # 'all'  -> Sales Manager / admin: department-wide, plus `salesmen`.
    scope: str
    counts: SalesHomeCounts
    attention: list[SalesAttentionItem]
    salesmen: list[SalesmanWorkloadRow]
