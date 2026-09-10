import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import {
  addMaterialAlternative,
  getMaterialAlternatives,
  listRawMaterials,
  removeMaterialAlternative,
  updateMaterialAlternative,
} from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { clampNonNegativeString } from '@/lib/number'
import type { RawMaterialAlternative, RawMaterialAlternativeStatus } from '@/types/rawMaterialAlternative'

interface EditableLine {
  id: number
  alternative_material_id: number
  alternative_label: string
  priority: string
  status: RawMaterialAlternativeStatus
  conversion_ratio: string
  notes: string
}

function toEditable(line: RawMaterialAlternative): EditableLine {
  return {
    id: line.id,
    alternative_material_id: line.alternative_material_id,
    alternative_label: line.alternative_code ? `${line.alternative_code} — ${line.alternative_name}` : (line.alternative_name ?? ''),
    priority: String(line.priority),
    status: line.status,
    conversion_ratio: String(line.conversion_ratio),
    notes: line.notes ?? '',
  }
}

interface NewLine {
  alternative_material_id: number
  priority: string
  conversion_ratio: string
  notes: string
}

function emptyNewLine(): NewLine {
  return { alternative_material_id: 0, priority: '1', conversion_ratio: '1', notes: '' }
}

interface MaterialAlternativesPanelProps {
  rawMaterialId: number
  canEdit: boolean
}

export function MaterialAlternativesPanel({ rawMaterialId, canEdit }: MaterialAlternativesPanelProps) {
  const [lines, setLines] = useState<EditableLine[]>([])
  const [alternativeIds, setAlternativeIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [newLine, setNewLine] = useState<NewLine>(emptyNewLine())
  const [adding, setAdding] = useState(false)

  const materialsFetcher = useCallback(
    () => listRawMaterials({ page: 1, page_size: 200, status: 'active' }),
    [],
  )
  const { options: allMaterials } = useSelectOptions(materialsFetcher)

  const load = useCallback(() => {
    setLoading(true)
    getMaterialAlternatives(rawMaterialId)
      .then((existing) => {
        setLines(existing.map(toEditable))
        setAlternativeIds(new Set(existing.map((l) => l.alternative_material_id)))
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [rawMaterialId])

  useEffect(load, [load])

  // Excludes this material itself (no self-alternative) and every
  // material already linked (no duplicate relationship) -- both also
  // enforced server-side (see raw_material_alternative_service), this
  // just keeps the picker from offering a choice guaranteed to fail.
  const availableMaterials = allMaterials.filter((m) => m.id !== rawMaterialId && !alternativeIds.has(m.id))

  function updateLine(id: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function handleSave(line: EditableLine) {
    const ratio = Number(line.conversion_ratio)
    if (!ratio || ratio <= 0) {
      setError('Conversion ratio must be greater than 0.')
      return
    }
    setSavingId(line.id)
    setError(null)
    try {
      await updateMaterialAlternative(rawMaterialId, line.id, {
        priority: Number(line.priority) || 1,
        status: line.status,
        conversion_ratio: ratio,
        notes: line.notes || null,
      })
      setNotice('Alternative saved.')
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
      await removeMaterialAlternative(rawMaterialId, line.id)
      setNotice('Alternative removed.')
      load()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setRemovingId(null)
    }
  }

  async function handleAdd() {
    if (!newLine.alternative_material_id) {
      setError('Choose a material.')
      return
    }
    const ratio = Number(newLine.conversion_ratio)
    if (!ratio || ratio <= 0) {
      setError('Conversion ratio must be greater than 0.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await addMaterialAlternative(rawMaterialId, {
        alternative_material_id: newLine.alternative_material_id,
        priority: Number(newLine.priority) || 1,
        conversion_ratio: ratio,
        notes: newLine.notes || null,
      })
      setNewLine(emptyNewLine())
      setNotice('Alternative added.')
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
        <h2 className="font-display text-lg font-medium text-white">Approved alternatives</h2>
        <p className="mt-1 text-sm text-white/50">
          Materials approved to substitute for this one, in priority order, with the conversion ratio to use.
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No approved alternatives defined yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lines
            .slice()
            .sort((a, b) => Number(a.priority) - Number(b.priority))
            .map((line) => (
              <div key={line.id} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <span className="mb-1 block text-xs tracking-wide text-white/40 uppercase">Alternative</span>
                  <Link
                    to={`/raw-materials/${line.alternative_material_id}`}
                    className="text-sm text-gold-300 hover:text-gold-200"
                  >
                    {line.alternative_label}
                  </Link>
                </div>
                <div className="sm:col-span-1">
                  <TextField
                    label="Priority"
                    type="number"
                    min="1"
                    value={line.priority}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { priority: clampNonNegativeString(e.target.value) || '1' })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Conversion ratio"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.conversion_ratio}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { conversion_ratio: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <SelectField
                    label="Status"
                    value={line.status}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { status: e.target.value as RawMaterialAlternativeStatus })}
                  >
                    <option value="approved">Approved</option>
                    <option value="blocked">Blocked</option>
                  </SelectField>
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Notes"
                    value={line.notes}
                    disabled={!canEdit}
                    onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                  />
                </div>
                {canEdit && (
                  <div className="flex gap-2 sm:col-span-1">
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
            ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-white/15 p-4 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-4">
            <SelectField
              label="Add alternative"
              value={newLine.alternative_material_id || ''}
              onChange={(e) => setNewLine((prev) => ({ ...prev, alternative_material_id: Number(e.target.value) }))}
            >
              <option value="">Choose…</option>
              {availableMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="sm:col-span-1">
            <TextField
              label="Priority"
              type="number"
              min="1"
              value={newLine.priority}
              onChange={(e) => setNewLine((prev) => ({ ...prev, priority: clampNonNegativeString(e.target.value) || '1' }))}
            />
          </div>
          <div className="sm:col-span-2">
            <TextField
              label="Conversion ratio"
              type="number"
              step="0.0001"
              min="0"
              value={newLine.conversion_ratio}
              onChange={(e) => setNewLine((prev) => ({ ...prev, conversion_ratio: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-3">
            <TextField
              label="Notes"
              value={newLine.notes}
              onChange={(e) => setNewLine((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              isLoading={adding}
              disabled={!newLine.alternative_material_id}
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
