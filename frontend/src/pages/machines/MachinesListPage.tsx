import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/ui'
import { MasterListPage, type MasterListColumn } from '@/components/master/MasterListPage'
import { listMachines } from '@/api/machines'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import type { Machine } from '@/types/machine'

/** The business runs exactly one production line, so "New" is only ever
 * offered while none exists yet -- `total` is captured off the same
 * response MasterListPage's own list fetch already gets, rather than a
 * second round-trip just to check a count. Mirrors the backend's own
 * rejection of a 2nd record in MachineCRUD.create. */
export function MachinesListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [total, setTotal] = useState<number | null>(null)
  const fetcher = useCallback(
    async (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => {
      const result = await listMachines(params)
      setTotal(result.total)
      return result
    },
    [],
  )

  const columns: MasterListColumn<Machine>[] = [
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      render: (m) => (
        <Link to={`/machines/${m.id}/edit`} className="font-medium text-gold-300 hover:text-gold-200">
          {m.code}
        </Link>
      ),
    },
    { key: 'name', label: 'Name', sortable: true, render: (m) => <span className="text-white">{m.name}</span> },
    {
      key: 'capacity_hours_per_day',
      label: 'Capacity (hrs/day)',
      render: (m) => <span className="text-white/60">{m.capacity_hours_per_day}</span>,
    },
    { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
  ]

  return (
    <MasterListPage
      title="Production Line"
      noun="production lines"
      fetcher={fetcher}
      columns={columns}
      rowKey={(m) => m.id}
      hasSearch={false}
      canCreate={canWrite(user?.role) && total === 0}
      createLabel="Add production line"
      onCreate={() => navigate('/machines/new')}
    />
  )
}
