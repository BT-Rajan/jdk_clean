import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/ui'
import { MasterListPage, type MasterListColumn } from '@/components/master/MasterListPage'
import { listDepartments } from '@/api/departments'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import type { Department } from '@/types/department'

export function DepartmentsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) =>
      listDepartments(params),
    [],
  )

  const columns: MasterListColumn<Department>[] = [
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      render: (d) => (
        <Link to={`/departments/${d.id}/edit`} className="font-medium text-gold-300 hover:text-gold-200">
          {d.code}
        </Link>
      ),
    },
    { key: 'name', label: 'Name', sortable: true, render: (d) => <span className="text-white">{d.name}</span> },
    { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
  ]

  return (
    <MasterListPage
      title="Departments"
      noun="departments"
      fetcher={fetcher}
      columns={columns}
      rowKey={(d) => d.id}
      searchPlaceholder="Code or name…"
      canCreate={isAdmin(user?.role)}
      createLabel="New department"
      onCreate={() => navigate('/departments/new')}
    />
  )
}
