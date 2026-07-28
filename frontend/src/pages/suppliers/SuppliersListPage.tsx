import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  SelectField,
  Spinner,
  StatusBadge,
  TextField,
} from '@/components/ui'
import { listSuppliers } from '@/api/suppliers'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'

export function SuppliersListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; search?: string; status?: string }) => listSuppliers(params),
    [],
  )
  const { items, total, totalPages, page, setPage, searchInput, setSearchInput, status, setStatus, loading, error } =
    usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Suppliers</h1>
          <p className="mt-2 text-sm text-white/50">{total} on file</p>
        </div>
        {canWrite(user?.role) && <Button onClick={() => navigate('/suppliers/new')}>New supplier</Button>}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
        <TextField
          label="Search"
          placeholder="Code, name, email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No suppliers found" message="Try a different search or add a new supplier." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Code</th>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">City / Country</th>
                  <th className="px-6 py-4 font-medium">Payment terms</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/suppliers/${s.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {s.code}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{s.name}</td>
                    <td className="px-6 py-4 text-white/60">{[s.city, s.country].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-6 py-4 text-white/60">{s.payment_terms_days} days</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={s.status} />
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
