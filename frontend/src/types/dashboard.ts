/** Mirrors backend/app/schemas/dashboard.py. Every number/point here is
 * computed live from the database (see dashboard_service.py) -- nothing
 * client-side is mocked or cached in localStorage. */

export interface DashboardTrend {
  value: number
  isPositive: boolean
}

export interface DashboardStat {
  value: string | number
  trend?: DashboardTrend
}

export interface DashboardGraphPoint {
  label: string
  value: number
}

export interface DashboardStatsResponse {
  stats: Record<string, DashboardStat>
  graphs: Record<string, DashboardGraphPoint[]>
}
