from pydantic import BaseModel


class DashboardTrend(BaseModel):
    value: float
    isPositive: bool


class DashboardStat(BaseModel):
    value: str | int | float
    trend: DashboardTrend | None = None


class DashboardGraphPoint(BaseModel):
    label: str
    value: float


class DashboardStatsOut(BaseModel):
    stats: dict[str, DashboardStat]
    graphs: dict[str, list[DashboardGraphPoint]]
