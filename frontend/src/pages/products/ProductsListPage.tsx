import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Badge,
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
import { activateProduct, deactivateProduct, listProducts } from '@/api/products'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { formatCurrency } from '@/lib/currency'
import { getApiErrorMessage } from '@/lib/apiError'

export function ProductsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
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
    refetch,
  } = usePagedResource(fetcher)

  async function handleToggleStatus(id: number, currentStatus: string) {
    setBusyId(id)
    setActionError(null)
    try {
      if (currentStatus === 'active') {
        await deactivateProduct(id)
      } else {
        await activateProduct(id)
      }
      await refetch()
    } catch (err) {
      setActionError(getApiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Products</h1>
          <p className="mt-2 text-sm text-white/50">{total} on file</p>
        </div>
        {canWrite(user?.role) && <Button onClick={() => navigate('/products/new')}>New product</Button>}
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

      <Alert variant="error">{error ?? actionError}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No products found" message="Try a different search or add a new product." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Code" field="code" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Name" field="name" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Selling price</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  {canWrite(user?.role) && <th className="px-6 py-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/products/${p.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {p.code}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{p.name}</td>
                    <td className="px-6 py-4">
                      <Badge tone={p.product_type === 'finished_good' ? 'gold' : 'info'}>{p.product_type}</Badge>
                    </td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(p.selling_price)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={p.status} />
                    </td>
                    {canWrite(user?.role) && (
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={busyId === p.id}
                          onClick={() => handleToggleStatus(p.id, p.status)}
                        >
                          {p.status === 'active' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    )}
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
