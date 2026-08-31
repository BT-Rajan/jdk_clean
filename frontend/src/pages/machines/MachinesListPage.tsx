import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/ui'
import { MasterListPage, type MasterListColumn } from '@/components/master/MasterListPage'
import { listMachines } from '@/api/machines'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import type { Machine } from '@/types/machine'

export function MachinesListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => listMachines(params),
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
      title="Machines"
      noun="machines"
      fetcher={fetcher}
      columns={columns}
      rowKey={(m) => m.id}
      searchPlaceholder="Code or name…"
      canCreate={canWrite(user?.role)}
      createLabel="New machine"
      onCreate={() => navigate('/machines/new')}
    />
  )
}
