import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  SelectField,
  SortableHeader,
  Spinner,
  StatusBadge,
  TextField,
} from '@/components/ui'
import { listCustomers } from '@/api/customers'
import { listAssignableSalesmen } from '@/api/salesHome'
import type { AssignableSalesman } from '@/api/salesHome'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment, isAdmin } from '@/lib/roles'
import { formatDate } from '@/lib/dateFormat'

export function CustomersListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Free-text, not a picklist -- category has no fixed set of values
  // (see models/customer.py's comment on why), so this narrows by
  // substring the same way Search does rather than offering a dropdown
  // of options that would need to be kept in sync with what's on file.
  const [categoryFilter, setCategoryFilter] = useState('')
  // Salesman filter -- Sales Manager / admin only (a salesman only ever sees
  // their own customers, so there's nothing to filter). The Sales Home's
  // workload table links here with ?assigned_to=<id> or ?assigned_to=null.
  const canSeeSalesmen = isAdmin(user?.role) || user?.role === 'department_head'
  const [searchParams] = useSearchParams()
  const [salesmanFilter, setSalesmanFilter] = useState(canSeeSalesmen ? (searchParams.get('assigned_to') ?? '') : '')
  const [salesmen, setSalesmen] = useState<AssignableSalesman[]>([])
  useEffect(() => {
    if (!canSeeSalesmen) return
    listAssignableSalesmen().then(setSalesmen).catch(() => setSalesmen([]))
  }, [canSeeSalesmen])
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) =>
      listCustomers({ ...params, category: categoryFilter || undefined, assigned_to: salesmanFilter || undefined }),
    [categoryFilter, salesmanFilter],
  )
  const {
    items,
    total,
    totalPages,
    page,
    setPage,
    searchInput,
    setSearchInput,
    status,
    setStatus,
    sort,
    toggleSort,
    loading,
    error,
  } = usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Customers</h1>
          <p className="mt-2 text-sm text-white/50">{total} customers on file</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <TextField
              label="Search"
              placeholder="Code, name, contact, email, mobile…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="w-40">
            <TextField
              label="Category"
              placeholder="Any"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            />
          </div>
          <div className="w-44">
            <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </div>
          {canSeeSalesmen && (
            <div className="w-48">
              <SelectField label="Salesman" value={salesmanFilter} onChange={(e) => setSalesmanFilter(e.target.value)}>
                <option value="">All salesmen</option>
                <option value="null">Unassigned</option>
                {salesmen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {(searchInput || categoryFilter || status || salesmanFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('')
                setCategoryFilter('')
                setSalesmanFilter('')
                setStatus('')
              }}
            >
              Clear filters
            </Button>
          )}
          {/* Creating a customer stays open to Sales (matches the backend's
              customers page_key write guard); editing/deleting an existing
              one is admin-only -- see CustomerDetailPage. */}
          {canWriteDepartment(user, 'sales') && (
            <Button onClick={() => navigate('/customers/new')}>New customer</Button>
          )}
        </div>
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No customers found" message="Try a different search or add a new customer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Code" field="code" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Name" field="name" sort={sort} onSort={toggleSort} />
                  {canSeeSalesmen && <th className="px-6 py-4 font-medium">Salesman</th>}
                  <th className="px-6 py-4 font-medium">Contact</th>
                  <th className="px-6 py-4 font-medium">Mobile</th>
                  <th className="px-6 py-4 font-medium">Email</th>
                  <th className="px-6 py-4 font-medium">City</th>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <SortableHeader label="Created" field="created_at" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/customers/${c.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {c.code ?? 'Prospective'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{c.trade_name || c.name}</td>
                    {canSeeSalesmen && (
                      <td className={c.assigned_to ? 'px-6 py-4 text-white/60' : 'px-6 py-4 text-amber-200'}>
                        {c.assigned_to_name ?? 'Unassigned'}
                      </td>
                    )}
                    <td className="px-6 py-4 text-white/60">{c.contact_person || '—'}</td>
                    <td className="px-6 py-4 text-white/60">{c.phone || '—'}</td>
                    <td className="px-6 py-4 text-white/60">{c.email || '—'}</td>
                    <td className="px-6 py-4 text-white/60">{c.city || '—'}</td>
                    <td className="px-6 py-4 text-white/60">{c.category || '—'}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-6 py-4 text-white/60">{formatDate(c.created_at)}</td>
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
