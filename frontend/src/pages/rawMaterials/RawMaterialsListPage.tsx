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
  SortableHeader,
  Spinner,
  StatusBadge,
  TextField,
} from '@/components/ui'
import { listRawMaterials } from '@/api/rawMaterials'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { formatCurrency } from '@/lib/currency'

export function RawMaterialsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => listRawMaterials(params),
    [],
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
          <h1 className="font-display text-3xl font-medium text-white">Raw materials</h1>
          <p className="mt-2 text-sm text-white/50">{total} on file</p>
        </div>
        {canWrite(user?.role) && <Button onClick={() => navigate('/raw-materials/new')}>New material</Button>}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
        <TextField
          label="Search"
          placeholder="Code, name…"
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
          <EmptyState title="No raw materials found" message="Try a different search or add a new material." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Code" field="code" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Name" field="name" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Unit</th>
                  <th className="px-6 py-4 font-medium">Reorder point</th>
                  <th className="px-6 py-4 font-medium">Unit cost</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/raw-materials/${m.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {m.code}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{m.name}</td>
                    <td className="px-6 py-4 text-white/60">{m.unit}</td>
                    <td className="px-6 py-4 text-white/60">{m.reorder_point}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(m.unit_cost)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={m.status} />
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
