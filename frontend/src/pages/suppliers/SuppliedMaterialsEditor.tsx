import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { getSupplierMaterials, replaceSupplierMaterials } from '@/api/supplierMaterials'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { generateId } from '@/lib/id'
import type { SupplierMaterialInput } from '@/types/supplierMaterial'

interface EditableLine extends SupplierMaterialInput {
  key: string
  /** Auto-captured, display-only -- absent for a line not yet saved. */
  onboarded_at?: string
  last_transaction_at?: string | null
}

function emptyLine(): EditableLine {
  return { key: generateId(), raw_material_id: 0, max_supply_quantity: 1, lead_time_days: null }
}

interface SuppliedMaterialsEditorProps {
  supplierId: number
  canEdit: boolean
}

export function SuppliedMaterialsEditor({ supplierId, canEdit }: SuppliedMaterialsEditorProps) {
  const [lines, setLines] = useState<EditableLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const rawMaterialsFetcher = useCallback(
    () => listRawMaterials({ page: 1, page_size: 200, status: 'active' }),
    [],
  )
  const { options: rawMaterials } = useSelectOptions(rawMaterialsFetcher)

  useEffect(() => {
    getSupplierMaterials(supplierId)
      .then((existing) => {
        setLines(
          existing.map((l) => ({
            key: generateId(),
            raw_material_id: l.raw_material_id,
            max_supply_quantity: l.max_supply_quantity,
            lead_time_days: l.lead_time_days,
            onboarded_at: l.onboarded_at,
            last_transaction_at: l.last_transaction_at,
          })),
        )
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [supplierId])

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
      const payload: SupplierMaterialInput[] = lines.map(({ key: _key, ...line }) => line)
      await replaceSupplierMaterials(supplierId, payload)
      setNotice('Supplied materials saved.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
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
    <GlassCard className="p-6">
      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-medium text-white">Materials supplied</h2>
          <p className="mt-1 text-sm text-white/50">
            Which raw materials this supplier can provide, how much of each per year, and typical lead time.
          </p>
        </div>
        {canEdit && (
          <Button variant="ghost" size="sm" type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            Add line
          </Button>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No materials linked to this supplier yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lines.map((line) => {
            const selectedMaterial = rawMaterials.find((opt) => opt.id === line.raw_material_id)
            return (
            <div
              key={line.key}
              className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end"
            >
              <div className="sm:col-span-6">
                <SelectField
                  label="Raw material"
                  value={line.raw_material_id || ''}
                  disabled={!canEdit}
                  onChange={(e) => updateLine(line.key, { raw_material_id: Number(e.target.value) })}
                >
                  <option value="">Choose…</option>
                  {rawMaterials.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.code} — {opt.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="sm:col-span-3">
                <TextField
                  label="Supply capacity (per year)"
                  type="number"
                  step="0.0001"
                  hint={selectedMaterial ? `In ${selectedMaterial.unit}` : undefined}
                  value={line.max_supply_quantity}
                  disabled={!canEdit}
                  onChange={(e) => updateLine(line.key, { max_supply_quantity: Number(e.target.value) })}
                />
              </div>
              <div className="sm:col-span-2">
                <TextField
                  label="Lead time (days)"
                  type="number"
                  value={line.lead_time_days ?? ''}
                  disabled={!canEdit}
                  onChange={(e) =>
                    updateLine(line.key, { lead_time_days: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </div>
              {canEdit && (
                <div className="sm:col-span-1">
                  <Button variant="ghost" size="sm" type="button" onClick={() => removeLine(line.key)}>
                    Remove
                  </Button>
                </div>
              )}
              {(line.onboarded_at || line.last_transaction_at !== undefined) && (
                <div className="sm:col-span-12 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/40">
                  {line.onboarded_at && <span>Onboarded {formatDate(line.onboarded_at)}</span>}
                  <span>
                    Last transaction {line.last_transaction_at ? formatDate(line.last_transaction_at) : 'None yet'}
                  </span>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {canEdit && (
        <div className="mt-5 flex justify-end">
          <Button onClick={handleSave} isLoading={saving}>
            Save supplied materials
          </Button>
        </div>
      )}
    </GlassCard>
  )
}
