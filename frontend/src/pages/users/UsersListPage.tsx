import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui'
import { MasterListPage, type MasterListColumn } from '@/components/master/MasterListPage'
import { listUsers } from '@/api/users'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import type { User } from '@/types/auth'

/** Users' one real list page -- previously this master was only reachable
 * as a tab inside Admin (pages/admin/UsersSection.tsx, a second
 * hand-rolled fetch/paginate/search table), while every other master
 * already had its own page under Master Data. That duplicate is gone;
 * Users now follows the same MasterListPage pattern as Departments,
 * Departments, Production Line, etc. -- served from Master Data only, same as the
 * spec requires. Still admin-only to view (see App.tsx's AdminOnlyGuard
 * wrapping /users), same restriction the Admin tab had. */
export function UsersListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; sort?: string }) => listUsers(params),
    [],
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
    />
  )
}
