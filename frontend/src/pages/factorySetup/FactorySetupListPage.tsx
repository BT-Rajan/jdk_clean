import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  EmptyState,
  GlassCard,
  Pagination,
  SelectField,
  SortableHeader,
  Spinner,
  TextField,
} from '@/components/ui'
import { listProducts } from '@/api/products'
import { listMachines } from '@/api/machines'
import { usePagedResource } from '@/hooks/usePagedResource'
import type { Machine } from '@/types/machine'

export function FactorySetupListPage() {
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => listProducts(params),
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

  const [machinesById, setMachinesById] = useState<Record<number, Machine>>({})
  useEffect(() => {
    listMachines({ page: 1, page_size: 200 })
      .then((res) => setMachinesById(Object.fromEntries(res.items.map((m) => [m.id, m]))))
      .catch(() => setMachinesById({}))
  }, [])

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Factory setup</h1>
          <p className="mt-2 text-sm text-white/50">
            Every product's formula for feasibility checks: raw materials, machine, time, and labor.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
        <TextField
          label="Search"
          placeholder="Product code or name…"
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
          <EmptyState title="No products found" message="Try a different search, or add products first." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Code" field="code" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Name" field="name" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Machine</th>
                  <th className="px-6 py-4 font-medium">Hours / unit</th>
                  <th className="px-6 py-4 font-medium">Workers</th>
                  <th className="px-6 py-4 font-medium">Formula</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const formulaComplete = p.machine_id !== null && p.production_hours_per_unit !== null
                  return (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                      <td className="px-6 py-4">
                        <Link to={`/factory-setup/${p.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                          {p.code}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-white">{p.name}</td>
                      <td className="px-6 py-4 text-white/60">
                        {p.machine_id ? machinesById[p.machine_id]?.name ?? `#${p.machine_id}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-white/60">{p.production_hours_per_unit ?? '—'}</td>
                      <td className="px-6 py-4 text-white/60">{p.workers_required ?? '—'}</td>
                      <td className="px-6 py-4">
                        {formulaComplete ? (
                          <span className="text-xs text-emerald-300">Set up</span>
                        ) : (
                          <span className="text-xs text-amber-300">Incomplete</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </AppLayout>
  )
}
