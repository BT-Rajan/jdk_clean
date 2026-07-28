import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { explodeBom, getBom, replaceBom } from '@/api/bom'
import { listProducts } from '@/api/products'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import type { BomExplosionResult, BomLineInput, ComponentType } from '@/types/bom'

interface EditableLine extends BomLineInput {
  key: string
}

function emptyLine(): EditableLine {
  return {
    key: crypto.randomUUID(),
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

  useEffect(() => {
    getBom(productId)
      .then((existing) => {
        setLines(
          existing.map((l) => ({
            key: crypto.randomUUID(),
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
  }, [productId])

  function componentOptions(type: ComponentType) {
    return type === 'raw_material' ? rawMaterials : products
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload: BomLineInput[] = lines.map(({ key: _key, ...line }) => line)
      await replaceBom(productId, payload)
      setNotice('Bill of materials saved.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
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
          {canEdit && (
            <Button variant="ghost" size="sm" type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              Add line
            </Button>
          )}
        </div>

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
                      updateLine(line.key, { component_type: e.target.value as ComponentType, component_id: 0 })
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
                    onChange={(e) => updateLine(line.key, { component_id: Number(e.target.value) })}
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
                  <TextField
                    label="Unit"
                    value={line.unit}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                  />
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
                    <Button variant="ghost" size="sm" type="button" onClick={() => removeLine(line.key)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="mt-5 flex justify-end">
            <Button onClick={handleSave} isLoading={saving}>
              Save bill of materials
            </Button>
          </div>
        )}
      </GlassCard>

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
