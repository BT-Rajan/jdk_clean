import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, GlassCard, SelectField, Spinner, StatusBadge, TextField } from '@/components/ui'
import {
  addMaterialSupplier,
  getMaterialSuppliers,
  removeMaterialSupplier,
  updateMaterialSupplier,
} from '@/api/rawMaterials'
import { listSuppliers } from '@/api/suppliers'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { clampNonNegativeString } from '@/lib/number'
import type { SupplierMaterial, SupplierMaterialStatus } from '@/types/supplierMaterial'

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
}

/** Line values kept as raw strings while editing (like BomEditor's
 * quantity/scrap_percent) so a field can be blank mid-edit instead of
 * collapsing to "0" -- converted back to numbers only when saving. */
interface EditableLine {
  id: number
  supplier_id: number
  supplier_label: string
  supplier_material_code: string
  purchase_price: string
  currency: string
  max_supply_quantity: string
  lead_time_days: string
  moq: string
  is_preferred: boolean
  status: SupplierMaterialStatus
}

function toEditable(line: SupplierMaterial): EditableLine {
  return {
    id: line.id,
    supplier_id: line.supplier_id,
    supplier_label: line.supplier_code ? `${line.supplier_code} — ${line.supplier_name}` : (line.supplier_name ?? ''),
    supplier_material_code: line.supplier_material_code ?? '',
    purchase_price: String(line.purchase_price),
    currency: line.currency,
    max_supply_quantity: String(line.max_supply_quantity),
    lead_time_days: line.lead_time_days != null ? String(line.lead_time_days) : '',
    moq: String(line.moq),
    is_preferred: line.is_preferred,
    status: line.status,
  }
}

interface NewLine {
  supplier_id: number
  supplier_material_code: string
  purchase_price: string
  currency: string
  max_supply_quantity: string
  lead_time_days: string
  moq: string
  is_preferred: boolean
}

function emptyNewLine(): NewLine {
  return {
    supplier_id: 0,
    supplier_material_code: '',
    purchase_price: '0',
    currency: 'KWD',
    max_supply_quantity: '1',
    lead_time_days: '',
    moq: '0',
    is_preferred: false,
  }
}

function validate(line: {
  supplier_id?: number
  max_supply_quantity: string
  moq: string
  currency: string
}): string | null {
  if (line.supplier_id !== undefined && !line.supplier_id) return 'Choose a supplier.'
  const maxQty = Number(line.max_supply_quantity)
  if (!maxQty || maxQty <= 0) return 'Maximum supply quantity must be greater than 0.'
  const moq = Number(line.moq) || 0
  if (moq > maxQty) return 'MOQ cannot exceed the maximum supply quantity.'
  if (line.currency.trim().length !== 3) return 'Currency must be a 3-letter code (e.g. KWD).'
  return null
}

interface MaterialSuppliersPanelProps {
  rawMaterialId: number
  canEdit: boolean
  /** Called after every load/save/add/remove so the Overview tab's
   * summary strip (preferred supplier, supplier count, lowest price,
   * lead time) can stay in sync without its own polling. */
  onChange?: (lines: SupplierMaterial[]) => void
}

export function MaterialSuppliersPanel({ rawMaterialId, canEdit, onChange }: MaterialSuppliersPanelProps) {
  const [lines, setLines] = useState<EditableLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [newLine, setNewLine] = useState<NewLine>(emptyNewLine())
  const [adding, setAdding] = useState(false)

  const suppliersFetcher = useCallback(() => listSuppliers({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: allSuppliers } = useSelectOptions(suppliersFetcher)

  const load = useCallback(() => {
    setLoading(true)
    getMaterialSuppliers(rawMaterialId)
      .then((existing) => {
        setLines(existing.map(toEditable))
        onChange?.(existing)
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [rawMaterialId, onChange])

  useEffect(load, [load])

  const linkedSupplierIds = new Set(lines.map((l) => l.supplier_id))
  const availableSuppliers = allSuppliers.filter((s) => !linkedSupplierIds.has(s.id))

  function updateLine(id: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function handleSave(line: EditableLine) {
    const problem = validate(line)
    if (problem) {
      setError(problem)
      return
    }
    setSavingId(line.id)
    setError(null)
    try {
      await updateMaterialSupplier(rawMaterialId, line.id, {
        supplier_material_code: line.supplier_material_code || null,
        purchase_price: Number(line.purchase_price) || 0,
        currency: line.currency.trim().toUpperCase(),
        max_supply_quantity: Number(line.max_supply_quantity) || 0,
        lead_time_days: line.lead_time_days === '' ? null : Number(line.lead_time_days),
        moq: Number(line.moq) || 0,
        is_preferred: line.is_preferred,
        status: line.status,
      })
      setNotice('Supplier terms saved.')
      load()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  async function handleRemove(line: EditableLine) {
    setRemovingId(line.id)
    setError(null)
    try {
      await removeMaterialSupplier(rawMaterialId, line.id)
      setNotice('Supplier removed from this material.')
      load()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setRemovingId(null)
    }
  }

  async function handleAdd() {
    const problem = validate(newLine)
    if (problem) {
      setError(problem)
      return
    }
    setAdding(true)
    setError(null)
    try {
      await addMaterialSupplier(rawMaterialId, {
        supplier_id: newLine.supplier_id,
        supplier_material_code: newLine.supplier_material_code || null,
        purchase_price: Number(newLine.purchase_price) || 0,
        currency: newLine.currency.trim().toUpperCase(),
        max_supply_quantity: Number(newLine.max_supply_quantity) || 0,
        lead_time_days: newLine.lead_time_days === '' ? null : Number(newLine.lead_time_days),
        moq: Number(newLine.moq) || 0,
        is_preferred: newLine.is_preferred,
      })
      setNewLine(emptyNewLine())
      setNotice('Supplier added.')
      load()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setAdding(false)
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

      <div className="mb-4">
        <h2 className="font-display text-lg font-medium text-white">Suppliers</h2>
        <p className="mt-1 text-sm text-white/50">
          Every supplier qualified to provide this material, at their own price, terms and lead time.
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No suppliers linked to this material yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lines.map((line) => (
            <div key={line.id} className="rounded-xl border border-white/10 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{line.supplier_label}</span>
                  {line.is_preferred && <Badge tone="gold">Preferred</Badge>}
                  <StatusBadge status={line.status} />
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" type="button" isLoading={savingId === line.id} onClick={() => handleSave(line)}>
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      isLoading={removingId === line.id}
                      onClick={() => handleRemove(line)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <TextField
                    label="Supplier material code"
                    value={line.supplier_material_code}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { supplier_material_code: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Purchase price"
                    type="number"
                    step="0.001"
                    min="0"
                    value={line.purchase_price}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { purchase_price: clampNonNegativeString(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <TextField
                    label="Currency"
                    maxLength={3}
                    value={line.currency}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { currency: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Max supply qty"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.max_supply_quantity}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { max_supply_quantity: clampNonNegativeString(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <TextField
                    label="MOQ"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.moq}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { moq: clampNonNegativeString(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <TextField
                    label="Lead time (days)"
                    type="number"
                    min="0"
                    value={line.lead_time_days}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { lead_time_days: clampNonNegativeString(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <SelectField
                    label="Status"
                    value={line.status}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { status: e.target.value as SupplierMaterialStatus })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </SelectField>
                </div>
                <div className="flex items-end sm:col-span-1">
                  <label className="flex items-center gap-2 pb-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={line.is_preferred}
                      disabled={!canEdit}
                      onChange={(e) => updateLine(line.id, { is_preferred: e.target.checked })}
                    />
                    Preferred
                  </label>
                </div>
              </div>
              <p className="mt-2 text-xs text-white/40">
                {money(Number(line.purchase_price) || 0, line.currency)} · MOQ {line.moq || 0} · lead time{' '}
                {line.lead_time_days || '—'} days
              </p>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-white/15 p-4 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-4">
            <SelectField
              label="Add supplier"
              value={newLine.supplier_id || ''}
              onChange={(e) => setNewLine((prev) => ({ ...prev, supplier_id: Number(e.target.value) }))}
            >
              <option value="">Choose…</option>
              {availableSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="sm:col-span-2">
            <TextField
              label="Purchase price"
              type="number"
              step="0.001"
              min="0"
              value={newLine.purchase_price}
              onChange={(e) => setNewLine((prev) => ({ ...prev, purchase_price: clampNonNegativeString(e.target.value) }))}
            />
          </div>
          <div className="sm:col-span-1">
            <TextField
              label="Currency"
              maxLength={3}
              value={newLine.currency}
              onChange={(e) => setNewLine((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
            />
          </div>
          <div className="sm:col-span-2">
            <TextField
              label="Max supply qty"
              type="number"
              step="0.0001"
              min="0"
              value={newLine.max_supply_quantity}
              onChange={(e) =>
                setNewLine((prev) => ({ ...prev, max_supply_quantity: clampNonNegativeString(e.target.value) }))
              }
            />
          </div>
          <div className="sm:col-span-1">
            <TextField
              label="MOQ"
              type="number"
              step="0.0001"
              min="0"
              value={newLine.moq}
              onChange={(e) => setNewLine((prev) => ({ ...prev, moq: clampNonNegativeString(e.target.value) }))}
            />
          </div>
          <div className="sm:col-span-1">
            <TextField
              label="Lead time"
              type="number"
              min="0"
              value={newLine.lead_time_days}
              onChange={(e) => setNewLine((prev) => ({ ...prev, lead_time_days: clampNonNegativeString(e.target.value) }))}
            />
          </div>
          <div className="sm:col-span-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              isLoading={adding}
              disabled={!newLine.supplier_id}
              onClick={handleAdd}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
