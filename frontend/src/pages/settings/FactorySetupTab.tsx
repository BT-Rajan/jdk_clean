import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Alert, Badge, Button, GlassCard, Spinner, StatusBadge, TextField } from '@/components/ui'
import { getSettings, updateSettings } from '@/api/settings'
import { listRawMaterials } from '@/api/rawMaterials'
import { listProducts } from '@/api/products'
import { listUsers } from '@/api/users'
import type { Settings } from '@/types/settings'
import type { RawMaterial } from '@/types/rawMaterial'
import type { Product } from '@/types/product'
import type { User } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'

const DAY_OPTIONS: { code: string; label: string }[] = [
  { code: 'Mon', label: 'Mon' },
  { code: 'Tue', label: 'Tue' },
  { code: 'Wed', label: 'Wed' },
  { code: 'Thu', label: 'Thu' },
  { code: 'Fri', label: 'Fri' },
  { code: 'Sat', label: 'Sat' },
  { code: 'Sun', label: 'Sun' },
]

type FactoryFields = Pick<Settings, 'factory_total_workers' | 'factory_workday_hours' | 'factory_working_days'>

function WorkingHoursCard() {
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<FactoryFields>()
  const workingDays = (watch('factory_working_days') || '').split(',').map((d) => d.trim()).filter(Boolean)

  useEffect(() => {
    getSettings()
      .then((s) =>
        reset({
          factory_total_workers: s.factory_total_workers,
          factory_workday_hours: s.factory_workday_hours,
          factory_working_days: s.factory_working_days,
        }),
      )
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [reset])

  function toggleWorkingDay(code: string) {
    const next = workingDays.includes(code)
      ? workingDays.filter((d) => d !== code)
      : [...workingDays, code]
    // Keep the stored order matching DAY_OPTIONS rather than click order,
    // so the string is stable/readable regardless of which day was toggled last.
    const ordered = DAY_OPTIONS.map((d) => d.code).filter((c) => next.includes(c))
    setValue('factory_working_days', ordered.join(','), { shouldDirty: true })
  }

  async function onSubmit(values: FactoryFields) {
    setFormError(null)
    setNotice(null)
    try {
      await updateSettings(values)
      setNotice('Saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <GlassCard className="p-8">
      <h2 className="font-display text-lg font-medium text-white">Weekdays &amp; working hours</h2>
      <p className="mt-1 text-sm text-white/50">
        The shared worker pool feasibility checks weigh against each product's "workers required" formula field,
        alongside each machine's own capacity. Every feasibility check's capacity estimate starts counting from the
        next working day after today (today itself is always left out) and skips whatever's off here.
      </p>
      <Alert variant="error">{formError}</Alert>
      {notice && (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Total workers" type="number" step="1" min="0" {...register('factory_total_workers')} />
            <TextField
              label="Workday hours (per worker)"
              type="number"
              step="0.5"
              min="0"
              {...register('factory_workday_hours')}
            />
          </div>
          <div className="mt-6">
            <span className="text-sm font-medium text-white/80">Working days</span>
            <input type="hidden" {...register('factory_working_days')} />
            <div className="mt-3 flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => {
                const active = workingDays.includes(day.code)
                return (
                  <button
                    key={day.code}
                    type="button"
                    onClick={() => toggleWorkingDay(day.code)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'border-gold-400 bg-gold-400/10 text-gold-200'
                        : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
                    }`}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button type="submit" isLoading={isSubmitting}>Save</Button>
          </div>
        </form>
      )}
    </GlassCard>
  )
}

function RawMaterialsCard() {
  const [items, setItems] = useState<RawMaterial[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRawMaterials({ page: 1, page_size: 8, sort: 'name' })
      .then((res) => setItems(res.items))
      .catch((err) => setError(getApiErrorMessage(err)))
  }, [])

  return (
    <GlassCard className="p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-white">Raw materials</h2>
          <p className="mt-1 text-sm text-white/50">Any number of materials, each with its own measuring unit.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/raw-materials/new"><Button variant="ghost" size="sm">Add raw material</Button></Link>
          <Link to="/raw-materials"><Button variant="ghost" size="sm">View all</Button></Link>
        </div>
      </div>
      <Alert variant="error">{error}</Alert>
      {items === null ? (
        <div className="flex justify-center py-8"><Spinner size={20} className="text-gold-300" /></div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No raw materials defined yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="py-3 pr-4 font-medium">Code</th>
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">Unit</th>
                <th className="py-3 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4">
                    <Link to={`/raw-materials/${m.id}`} className="font-medium text-gold-300 hover:text-gold-200">{m.code}</Link>
                  </td>
                  <td className="py-3 pr-4 text-white">{m.name}</td>
                  <td className="py-3 pr-4 text-white/60">{m.unit}</td>
                  <td className="py-3 pr-4"><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}

function ProductsCard() {
  const [items, setItems] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProducts({ page: 1, page_size: 8, sort: 'name' })
      .then((res) => setItems(res.items))
      .catch((err) => setError(getApiErrorMessage(err)))
  }, [])

  return (
    <GlassCard className="p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-white">Products</h2>
          <p className="mt-1 text-sm text-white/50">
            Price and batch production time. Open a product to also set its machine/labor formula, bill of
            materials, and packaging.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/products/new"><Button variant="ghost" size="sm">Add product</Button></Link>
          <Link to="/products"><Button variant="ghost" size="sm">View all</Button></Link>
        </div>
      </div>
      <Alert variant="error">{error}</Alert>
      {items === null ? (
        <div className="flex justify-center py-8"><Spinner size={20} className="text-gold-300" /></div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No products defined yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="py-3 pr-4 font-medium">Code</th>
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">Price</th>
                <th className="py-3 pr-4 font-medium">Batch</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4">
                    <Link to={`/products/${p.id}`} className="font-medium text-gold-300 hover:text-gold-200">{p.code}</Link>
                  </td>
                  <td className="py-3 pr-4 text-white">{p.name}</td>
                  <td className="py-3 pr-4 text-white/60">{formatCurrency(p.selling_price)}</td>
                  <td className="py-3 pr-4 text-white/60">
                    {p.batch_size && p.batch_production_hours != null
                      ? `${p.batch_size} ${p.unit} / ${p.batch_production_hours} hrs`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}

function UsersCard() {
  const [items, setItems] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listUsers({ page: 1, page_size: 8, sort: 'full_name' })
      .then((res) => setItems(res.items))
      .catch((err) => setError(getApiErrorMessage(err)))
  }, [])

  return (
    <GlassCard className="p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-white">Users</h2>
          <p className="mt-1 text-sm text-white/50">Accounts and roles.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/users/new"><Button variant="ghost" size="sm">Add user</Button></Link>
          <Link to="/admin?section=users"><Button variant="ghost" size="sm">View all</Button></Link>
        </div>
      </div>
      <Alert variant="error">{error}</Alert>
      {items === null ? (
        <div className="flex justify-center py-8"><Spinner size={20} className="text-gold-300" /></div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">Username</th>
                <th className="py-3 pr-4 font-medium">Role</th>
                <th className="py-3 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4">
                    <Link to={`/users/${u.id}`} className="font-medium text-gold-300 hover:text-gold-200">{u.full_name}</Link>
                  </td>
                  <td className="py-3 pr-4 text-white/60">{u.username}</td>
                  <td className="py-3 pr-4"><Badge tone="info">{u.role}</Badge></td>
                  <td className="py-3 pr-4">
                    <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}

export function FactorySetupTab() {
  return (
    <div className="flex flex-col gap-8">
      <WorkingHoursCard />
      <RawMaterialsCard />
      <ProductsCard />
      <UsersCard />
    </div>
  )
}
