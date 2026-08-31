import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { addPackagingLine, deletePackagingLine, getPackaging, replacePackaging } from '@/api/packaging'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { generateId } from '@/lib/id'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import type { PackagingLineInput } from '@/types/packaging'

interface EditableLine extends PackagingLineInput {
  key: string
  /** Set once the line has been persisted to the backend (either loaded
   * from the existing packaging list or added via the granular endpoint).
   * Lines without an id only exist client-side and are removed locally. */
  id?: number
}

function emptyLine(): EditableLine {
  return {
    key: generateId(),
    packaging_material_id: 0,
    quantity_per_unit: 1,
    unit: '',
  }
}

interface PackagingEditorProps {
  productId: number
  canEdit: boolean
}

export function PackagingEditor({ productId, canEdit }: PackagingEditorProps) {
  const [lines, setLines] = useState<EditableLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [newLine, setNewLine] = useState<EditableLine>(emptyLine())
  const [adding, setAdding] = useState(false)
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  const materialsFetcher = useCallback(
    () => listRawMaterials({ page: 1, page_size: 200, status: 'active' }),
    [],
  )
  const { options: materials } = useSelectOptions(materialsFetcher)

  function load() {
    setLoading(true)
    getPackaging(productId)
      .then((existing) => {
        setLines(
          existing.map((l) => ({
            key: generateId(),
            id: l.id,
            packaging_material_id: l.packaging_material_id,
            quantity_per_unit: l.quantity_per_unit,
            unit: l.unit,
          })),
        )
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [productId])

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
      await deletePackagingLine(productId, line.id)
      setLines((prev) => prev.filter((l) => l.key !== line.key))
      setNotice('Packaging material removed.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setRemovingKey(null)
    }
  }

  /** Persists edits to quantity/unit/material on existing lines. There's
   * no granular "update a line" endpoint, so this still replaces the
   * whole list -- adding and removing single lines go through their own
   * endpoints above instead. */
  async function handleSave() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload: PackagingLineInput[] = lines.map(({ key: _key, id: _id, ...line }) => line)
      const saved = await replacePackaging(productId, payload)
      setLines(
        saved.map((l) => ({
          key: generateId(),
          id: l.id,
          packaging_material_id: l.packaging_material_id,
          quantity_per_unit: l.quantity_per_unit,
          unit: l.unit,
        })),
      )
      setNotice('Packaging list saved.')
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
      const created = await addPackagingLine(productId, payload)
      setLines((prev) => [
        ...prev,
        {
          key: generateId(),
          id: created.id,
          packaging_material_id: created.packaging_material_id,
          quantity_per_unit: created.quantity_per_unit,
          unit: created.unit,
        },
      ])
      setNewLine(emptyLine())
      setNotice('Packaging material added.')
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
    <div className="flex flex-col gap-6">
      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      <GlassCard className="p-6">
        <div className="mb-4">
          <h2 className="font-display text-lg font-medium text-white">Packaging</h2>
          <p className="mt-1 text-sm text-white/50">
            Materials this product needs when it ships -- boxes, labels, wrap -- procured/stocked like a raw
            material, but never part of the production formula above: it goes out with the finished good rather
            than being consumed to make it.
          </p>
        </div>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">No packaging materials defined yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-6">
                  <SelectField
                    label="Packaging material"
                    value={line.packaging_material_id || ''}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.key, { packaging_material_id: Number(e.target.value) })}
                  >
                    <option value="">Choose…</option>
                    {materials.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.code} — {opt.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Qty per unit"
                    type="number"
                    step="0.0001"
                    value={line.quantity_per_unit}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.key, { quantity_per_unit: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <TextField
                    label="Unit"
                    value={line.unit}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.key, { unit: e.target.value })}
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
              <div className="sm:col-span-6">
                <SelectField
                  label="Packaging material"
                  value={newLine.packaging_material_id || ''}
                  onChange={(e) => setNewLine((prev) => ({ ...prev, packaging_material_id: Number(e.target.value) }))}
                >
                  <option value="">Choose…</option>
                  {materials.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.code} — {opt.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="sm:col-span-2">
                <TextField
                  label="Qty per unit"
                  type="number"
                  step="0.0001"
                  value={newLine.quantity_per_unit}
                  onChange={(e) => setNewLine((prev) => ({ ...prev, quantity_per_unit: Number(e.target.value) }))}
                />
              </div>
              <div className="sm:col-span-3">
                <TextField
                  label="Unit"
                  value={newLine.unit}
                  onChange={(e) => setNewLine((prev) => ({ ...prev, unit: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-1">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  isLoading={adding}
                  disabled={!newLine.packaging_material_id || !newLine.unit}
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

      <HistoryTimeline url={`/api/products/${productId}/packaging/history`} />
    </div>
  )
}
