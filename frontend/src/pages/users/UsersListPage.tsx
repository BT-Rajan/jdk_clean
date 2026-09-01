import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, SelectField } from '@/components/ui'
import { MasterListPage, type MasterListColumn } from '@/components/master/MasterListPage'
import { listUsers } from '@/api/users'
import { listDepartments } from '@/api/departments'
import { useAuth } from '@/hooks/useAuth'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { isAdmin } from '@/lib/roles'
import type { User, UserRole } from '@/types/auth'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
]

function useDepartmentOptions() {
  const fetcher = useCallback(() => listDepartments({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

/** Users' one real list page -- previously this master was only reachable
 * as a tab inside Admin (pages/admin/UsersSection.tsx, a second
 * hand-rolled fetch/paginate/search table), while every other master
 * already had its own page under Master Data. That duplicate is gone;
 * Users now follows the same MasterListPage pattern as Departments,
 * Production Line, etc. -- served from Master Data only, same as the
 * spec requires. Still admin-only to view (see App.tsx's AdminOnlyGuard
 * wrapping /users), same restriction the Admin tab had.
 *
 * Role/Department/Active filters below mirror what the backend already
 * supports (UserCRUD.filterable_fields: role, department_id, is_active --
 * see app/crud/master_data.py) but the UI never exposed; the generic
 * MasterListPage status filter is skipped (hasStatusFilter=false) since
 * it assumes a string status ENUM and users.is_active is a real boolean
 * (see backend/app/api/deps.py's dedicated is_active param). */
export function UsersListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { options: departments } = useDepartmentOptions()

  const [roleFilter, setRoleFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')

  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; sort?: string }) =>
      listUsers({
        ...params,
        role: roleFilter || undefined,
        department_id: departmentFilter ? Number(departmentFilter) : undefined,
        is_active: activeFilter === '' ? undefined : activeFilter === 'true',
      }),
    [roleFilter, departmentFilter, activeFilter],
  )

  const columns: MasterListColumn<User>[] = [
    {
      key: 'username',
      label: 'Username',
      sortable: true,
      render: (u) => (
        <Link to={`/users/${u.id}`} className="font-medium text-gold-300 hover:text-gold-200">
          {u.username}
        </Link>
      ),
    },
    { key: 'full_name', label: 'Full name', sortable: true, render: (u) => <span className="text-white">{u.full_name}</span> },
    { key: 'email', label: 'Email', render: (u) => <span className="text-white/60">{u.email}</span> },
    { key: 'role', label: 'Role', render: (u) => <Badge tone="gold">{u.role}</Badge> },
    {
      key: 'department_name',
      label: 'Department',
      render: (u) => <span className="text-white/60">{u.department_name ?? '—'}</span>,
    },
    {
      key: 'is_active',
      label: 'Active',
      render: (u) => <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'active' : 'inactive'}</Badge>,
    },
  ]

  return (
    <MasterListPage
      title="Users"
      noun="accounts"
      fetcher={fetcher}
      columns={columns}
      rowKey={(u) => u.id}
      searchPlaceholder="Username, name, email…"
      hasStatusFilter={false}
      canCreate={isAdmin(user?.role)}
      createLabel="New user"
      onCreate={() => navigate('/users/new')}
      extraFilters={
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Department" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Active" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
            <option value="">All</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </SelectField>
        </div>
      }
    />
  )
}
