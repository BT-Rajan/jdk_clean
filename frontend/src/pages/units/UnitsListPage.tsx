import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, StatusBadge } from '@/components/ui'
import { MasterListPage, type MasterListColumn } from '@/components/master/MasterListPage'
import { listUnits } from '@/api/units'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import type { UnitOfMeasure, UomCategory } from '@/types/unitOfMeasure'

const CATEGORY_LABELS: Record<UomCategory, string> = {
  weight: 'Weight',
  count: 'Count',
  volume: 'Volume',
}

export function UnitsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => listUnits(params),
    [],
  )

  const columns: MasterListColumn<UnitOfMeasure>[] = [
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      render: (u) => (
        <Link to={`/units/${u.id}/edit`} className="font-medium text-gold-300 hover:text-gold-200">
          {u.code}
        </Link>
      ),
    },
    { key: 'name', label: 'Name', sortable: true, render: (u) => <span className="text-white">{u.name}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (u) => <span className="text-white/60">{CATEGORY_LABELS[u.category]}</span> },
    {
      key: 'factor_to_base',
      label: 'Factor to base',
      render: (u) => (
        <span className="text-white/60">
          {u.factor_to_base} {u.is_base && <Badge tone="gold">Base</Badge>}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (u) => <StatusBadge status={u.status} /> },
  ]

  return (
    <MasterListPage
      title="Units of measure"
      noun="units"
      fetcher={fetcher}
      columns={columns}
      rowKey={(u) => u.id}
      searchPlaceholder="Code or name…"
      canCreate={isAdmin(user?.role)}
      createLabel="New unit"
      onCreate={() => navigate('/units/new')}
    />
  )
}
