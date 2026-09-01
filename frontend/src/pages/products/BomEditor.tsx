import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { addBomLine, deleteBomLine, explodeBom, getBom, replaceBom } from '@/api/bom'
import { listProducts } from '@/api/products'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { generateId } from '@/lib/id'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import type { BomExplosionResult, BomLineInput, ComponentType } from '@/types/bom'

interface EditableLine extends BomLineInput {
  key: string
  /** Set once the line has been persisted to the backend (either loaded
   * from the existing BOM or added via the granular endpoint). Lines
   * without an id only exist client-side and are removed locally. */
  id?: number
}

function emptyLine(): EditableLine {
  return {
    key: generateId(),
    component_type: 'raw_material',
    component_id: 0,
    quantity: 1,
    unit: '',
    scrap_percent: 0,
  }
}

interface BomEditorProps {
  productId: number
  canEdit: boolean
}

export function BomEditor({ productId, canEdit }: BomEditorProps) {
  const [lines, setLines] = useState<EditableLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [newLine, setNewLine] = useState<EditableLine>(emptyLine())
  const [adding, setAdding] = useState(false)
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  const rawMaterialsFetcher = useCallback(
    () => listRawMaterials({ page: 1, page_size: 200, status: 'active' }),
    [],
  )
  const productsFetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: rawMaterials } = useSelectOptions(rawMaterialsFetcher)
  const { options: products } = useSelectOptions(productsFetcher)

  const [explodeQty, setExplodeQty] = useState('1')
  const [explosion, setExplosion] = useState<BomExplosionResult | null>(null)
  const [exploding, setExploding] = useState(false)
  const [explodeError, setExplodeError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    getBom(productId)
      .then((existing) => {
        setLines(
          existing.map((l) => ({
            key: generateId(),
            id: l.id,
            component_type: l.component_type,
            component_id: l.component_id,
            quantity: l.quantity,
            unit: l.unit,
            scrap_percent: l.scrap_percent,
          })),
        )
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [productId])

  function componentOptions(type: ComponentType) {
    return type === 'raw_material' ? rawMaterials : products
  }

  /** A BOM line's unit always mirrors whatever unit its component is
   * itself stocked/produced in -- there's no unit conversion in the app
   * (see bom_service.explode_requirements, which sums quantities
   * directly), so letting a line's unit differ from its component's own
   * unit would silently produce wrong requirement totals rather than
   * converting correctly. Auto-derived and not user-editable, instead
   * of a picker, to make that mismatch structurally impossible. */
  function defaultUnitFor(type: ComponentType, componentId: number): string {
    const component = componentOptions(type).find((opt) => opt.id === componentId)
    return component?.unit ?? ''
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  /** Removes a line. Persisted lines are deleted immediately via the
   * single-line endpoint; unsaved lines just drop out of local state. */
  async function removeLine(line: EditableLine) {
    if (!line.id) {
      setLines((prev) => prev.filter((l) => l.key !== line.key))
      return
    }
    setRemovingKey(line.key)
    setError(null)
    try {
      await deleteBomLine(productId, line.id)
      setLines((prev) => prev.filter((l) => l.key !== line.key))
      setNotice('Component removed.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setRemovingKey(null)
    }
  }

  /** Persists edits to quantity/unit/scrap/type/component on existing
   * lines. There's no granular "update a line" endpoint, so this still
   * replaces the whole list -- adding and removing single components go
   * through their own endpoints above instead. */
  async function handleSave() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload: BomLineInput[] = lines.map(({ key: _key, id: _id, ...line }) => line)
      const saved = await replaceBom(productId, payload)
      setLines(
        saved.map((l) => ({
          key: generateId(),
          id: l.id,
          component_type: l.component_type,
          component_id: l.component_id,
          quantity: l.quantity,
          unit: l.unit,
          scrap_percent: l.scrap_percent,
        })),
      )
      setNotice('Bill of materials saved.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleAddLine() {
    setAdding(true)
    setError(null)
    try {
      const { key: _key, id: _id, ...payload } = newLine
      const created = await addBomLine(productId, payload)
      setLines((prev) => [
        ...prev,
        {
          key: generateId(),
          id: created.id,
          component_type: created.component_type,
          component_id: created.component_id,
          quantity: created.quantity,
          unit: created.unit,
          scrap_percent: created.scrap_percent,
        },
      ])
      setNewLine(emptyLine())
      setNotice('Component added.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  async function handleExplode() {
    setExploding(true)
    setExplodeError(null)
    try {
      const result = await explodeBom(productId, Number(explodeQty))
      setExplosion(result)
    } catch (err) {
      setExplodeError(getApiErrorMessage(err))
    } finally {
      setExploding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={24} className="text-gold-300" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-white">Bill of materials</h2>
        </div>
        <p className="mb-4 text-xs text-white/40">
          A line's Unit always matches whatever unit its component is itself stocked/produced in -- there's no
          conversion between units, so quantities here are read directly in that unit.
        </p>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">No components defined yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-2">
                  <SelectField
                    label="Type"
                    value={line.component_type}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateLine(line.key, {
                        component_type: e.target.value as ComponentType,
                        component_id: 0,
                        unit: '',
                      })
                    }
                  >
                    <option value="raw_material">Raw material</option>
                    <option value="product">Product</option>
                  </SelectField>
                </div>
                <div className="sm:col-span-4">
                  <SelectField
                    label="Component"
                    value={line.component_id || ''}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const componentId = Number(e.target.value)
                      updateLine(line.key, {
                        component_id: componentId,
                        unit: defaultUnitFor(line.component_type, componentId),
                      })
                    }}
                  >
                    <option value="">Choose…</option>
                    {componentOptions(line.component_type).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.code} — {opt.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Quantity"
                    type="number"
                    step="0.0001"
                    value={line.quantity}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextField label="Unit" value={line.unit} disabled readOnly />
                </div>
                <div className="sm:col-span-1">
                  <TextField
                    label="Scrap %"
                    type="number"
                    step="0.01"
                    value={line.scrap_percent}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.key, { scrap_percent: Number(e.target.value) })}
                  />
                </div>
                {canEdit && (
                  <div className="sm:col-span-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      isLoading={removingKey === line.key}
                      onClick={() => removeLine(line)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <>
            <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-white/15 p-4 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-2">
                <SelectField
                  label="Type"
                  value={newLine.component_type}
                  onChange={(e) =>
                    setNewLine((prev) => ({
                      ...prev,
                      component_type: e.target.value as ComponentType,
                      component_id: 0,
                      unit: '',
                    }))
                  }
                >
                  <option value="raw_material">Raw material</option>
                  <option value="product">Product</option>
                </SelectField>
              </div>
              <div className="sm:col-span-4">
                <SelectField
                  label="Component"
                  value={newLine.component_id || ''}
                  onChange={(e) => {
                    const componentId = Number(e.target.value)
                    setNewLine((prev) => ({
                      ...prev,
                      component_id: componentId,
                      unit: defaultUnitFor(prev.component_type, componentId),
                    }))
                  }}
                >
                  <option value="">Choose…</option>
                  {componentOptions(newLine.component_type).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.code} — {opt.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="sm:col-span-2">
                <TextField
                  label="Quantity"
                  type="number"
                  step="0.0001"
                  value={newLine.quantity}
                  onChange={(e) => setNewLine((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                />
              </div>
              <div className="sm:col-span-2">
                <TextField label="Unit" value={newLine.unit} disabled readOnly />
              </div>
              <div className="sm:col-span-1">
                <TextField
                  label="Scrap %"
                  type="number"
                  step="0.01"
                  value={newLine.scrap_percent}
                  onChange={(e) => setNewLine((prev) => ({ ...prev, scrap_percent: Number(e.target.value) }))}
                />
              </div>
              <div className="sm:col-span-1">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  isLoading={adding}
                  disabled={!newLine.component_id || !newLine.unit}
                  onClick={handleAddLine}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button onClick={handleSave} isLoading={saving}>
                Save changes
              </Button>
            </div>
          </>
        )}
      </GlassCard>

      <HistoryTimeline url={`/api/products/${productId}/bom/history`} title="Formula (BOM) history" />

      <GlassCard className="p-6">
        <h2 className="font-display text-lg font-medium text-white">Requirements calculator</h2>
        <p className="mt-1 text-sm text-white/50">Explode the BOM for a given quantity to see raw material needs.</p>

        <div className="mt-4 flex items-end gap-3">
          <div className="w-40">
            <TextField label="Quantity" type="number" step="0.0001" value={explodeQty} onChange={(e) => setExplodeQty(e.target.value)} />
          </div>
          <Button variant="ghost" onClick={handleExplode} isLoading={exploding}>
            Calculate
          </Button>
        </div>

        <Alert variant="error">{explodeError}</Alert>

        {explosion && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="py-3 pr-4 font-medium">Material</th>
                  <th className="py-3 pr-4 font-medium">Quantity required</th>
                  <th className="py-3 pr-4 font-medium">Unit</th>
                </tr>
              </thead>
              <tbody>
                {explosion.requirements.map((r) => (
                  <tr key={r.raw_material_id} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-4 text-white">{r.code} — {r.name}</td>
                    <td className="py-3 pr-4 text-white/60">{r.quantity_required.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-white/60">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
