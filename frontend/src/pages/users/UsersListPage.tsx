import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Button, EmptyState, GlassCard, Pagination, SortableHeader, Spinner, TextField } from '@/components/ui'
import { listUsers } from '@/api/users'
import { usePagedResource } from '@/hooks/usePagedResource'

export function UsersListPage() {
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; search?: string; sort?: string }) => listUsers(params),
    [],
  )
  const { items, total, totalPages, page, setPage, searchInput, setSearchInput, sort, toggleSort, loading, error } =
    usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Users</h1>
          <p className="mt-2 text-sm text-white/50">{total} accounts</p>
        </div>
        <Button onClick={() => navigate('/users/new')}>New user</Button>
      </div>

      <div className="mb-6">
        <TextField
          label="Search"
          placeholder="Username, name, email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No users found" message="Try a different search or add a new user." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Username" field="username" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Full name" field="full_name" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Email</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/users/${u.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {u.username}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{u.full_name}</td>
                    <td className="px-6 py-4 text-white/60">{u.email}</td>
                    <td className="px-6 py-4">
                      <Badge tone="gold">{u.role}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'active' : 'inactive'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </AppLayout>
  )
}
