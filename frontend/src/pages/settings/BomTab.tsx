import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { createUnit, listUnits, updateUnit } from '@/api/units'
import { listProducts } from '@/api/products'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import type { UnitOfMeasure, UomCategory } from '@/types/unitOfMeasure'
import { BomEditor } from '@/pages/products/BomEditor'

const CATEGORY_LABELS: Record<UomCategory, string> = {
  weight: 'Weight',
  count: 'Count',
  volume: 'Volume',
}

function emptyDraft() {
  return { code: '', name: '', category: 'weight' as UomCategory, factor_to_base: 1, is_base: false }
}

function UnitsOfMeasurePanel() {
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [creating, setCreating] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  // Local text per row so typing doesn't fire a save on every keystroke --
  // committed via handleFactorChange on blur instead.
  const [factorDrafts, setFactorDrafts] = useState<Record<number, string>>({})

  function load() {
    setLoading(true)
    setError(null)
    listUnits({ page: 1, page_size: 100, sort: 'category' })
      .then((result) => {
        setUnits(result.items)
        setFactorDrafts(Object.fromEntries(result.items.map((u) => [u.id, String(u.factor_to_base)])))
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    setNotice(null)
    try {
      await createUnit(draft)
      setDraft(emptyDraft())
      setNotice('Unit added.')
      load()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleFactorChange(unit: UnitOfMeasure, factor_to_base: number) {
    if (!Number.isFinite(factor_to_base) || factor_to_base <= 0 || factor_to_base === unit.factor_to_base) return
    setSavingId(unit.id)
    setError(null)
    try {
      const updated = await updateUnit(unit.id, { factor_to_base })
      setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      setFactorDrafts((prev) => ({ ...prev, [updated.id]: String(updated.factor_to_base) }))
    } catch (err) {
      setError(getApiErrorMessage(err))
      setFactorDrafts((prev) => ({ ...prev, [unit.id]: String(unit.factor_to_base) }))
    } finally {
      setSavingId(null)
    }
  }

  async function handleToggleStatus(unit: UnitOfMeasure) {
    setSavingId(unit.id)
    setError(null)
    try {
      const updated = await updateUnit(unit.id, { status: unit.status === 'active' ? 'inactive' : 'active' })
      setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <GlassCard className="p-6">
      <h2 className="font-display text-lg font-medium text-white">Units of measure</h2>
      <p className="mt-1 text-sm text-white/50">
        Every BOM line and raw material's unit is picked from this list. Conversion between units in the same
        category (e.g. bag → kg) uses each unit's factor below when feasibility/MRP calculate raw-material
        requirements — see the note on the BOM editor. "Bag" ships assuming 50kg; edit its factor here if that's
        wrong for what you're actually bagging.
      </p>

      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={20} className="text-gold-300" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="py-3 pr-4 font-medium">Code</th>
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">Category</th>
                <th className="py-3 pr-4 font-medium">Factor to base</th>
                <th className="py-3 pr-4 font-medium">Base unit</th>
                <th className="py-3 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4 font-medium text-white">{u.code}</td>
                  <td className="py-3 pr-4 text-white/70">{u.name}</td>
                  <td className="py-3 pr-4 text-white/60">{CATEGORY_LABELS[u.category]}</td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      step="0.000001"
                      aria-label={`Factor to base for ${u.name}`}
                      value={factorDrafts[u.id] ?? String(u.factor_to_base)}
                      disabled={u.is_base || savingId === u.id}
                      onChange={(e) => setFactorDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      onBlur={(e) => handleFactorChange(u, Number(e.target.value))}
                      className="w-32 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-gold-400/60 disabled:opacity-40"
                    />
                  </td>
                  <td className="py-3 pr-4">{u.is_base && <Badge tone="gold">Base</Badge>}</td>
                  <td className="py-3 pr-4">
                    <Button variant="ghost" size="sm" isLoading={savingId === u.id} onClick={() => handleToggleStatus(u)}>
                      {u.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-white/15 p-4 sm:grid-cols-12 sm:items-end">
        <div className="sm:col-span-2">
          <TextField
            label="Code"
            placeholder="e.g. bag25"
            value={draft.code}
            onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-3">
          <TextField
            label="Name"
            placeholder="e.g. Bag (25kg)"
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-3">
          <SelectField
            label="Category"
            value={draft.category}
            onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value as UomCategory }))}
          >
            <option value="weight">Weight</option>
            <option value="count">Count</option>
            <option value="volume">Volume</option>
          </SelectField>
        </div>
        <div className="sm:col-span-2">
          <TextField
            label="Factor to base"
            type="number"
            step="0.000001"
            value={draft.factor_to_base}
            onChange={(e) => setDraft((prev) => ({ ...prev, factor_to_base: Number(e.target.value) }))}
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            isLoading={creating}
            disabled={!draft.code || !draft.name}
            onClick={handleCreate}
          >
            Add unit
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

export function BomTab() {
  const productsFetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: products } = useSelectOptions(productsFetcher)
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')

  return (
    <div className="flex flex-col gap-6">
      <UnitsOfMeasurePanel />

      <GlassCard className="p-6">
        <h2 className="font-display text-lg font-medium text-white">Bill of materials</h2>
        <p className="mt-1 text-sm text-white/50">
          Pick a product to configure what raw materials (or sub-assembly products) go into one unit of it, and how
          much of each. This is what feasibility, MRP, and every reorder-point comparison read from — get it
          precise here and everything downstream that depends on it follows.
        </p>
        <div className="mt-4 max-w-sm">
          <SelectField
            label="Product"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      </GlassCard>

      {selectedProductId !== '' && <BomEditor productId={selectedProductId} canEdit />}
    </div>
  )
}
