import { useEffect, useState } from 'react'
import { Alert, Button, GlassCard, Spinner } from '@/components/ui'
import { getPermissionMatrix, updatePermissionMatrix } from '@/api/permissions'
import type { AccessLevel, Department, PermissionEntry } from '@/types/permission'
import { PAGE_LABELS } from '@/lib/pagePermissions'
import { getApiErrorMessage } from '@/lib/apiError'

const DEPARTMENTS: { key: Department; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'warehouse', label: 'Warehouse' },
]

type Grid = Record<Department, Record<string, AccessLevel>>

function toGrid(entries: PermissionEntry[]): Grid {
  const grid = { sales: {}, procurement: {}, warehouse: {} } as Grid
  for (const entry of entries) {
    grid[entry.department][entry.page_key] = entry.access_level
  }
  return grid
}

function toEntries(grid: Grid): PermissionEntry[] {
  const entries: PermissionEntry[] = []
  for (const department of Object.keys(grid) as Department[]) {
    for (const [pageKey, level] of Object.entries(grid[department])) {
      entries.push({ department, page_key: pageKey, access_level: level })
    }
  }
  return entries
}

export function AccessControlTab() {
  const [grid, setGrid] = useState<Grid | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getPermissionMatrix()
      .then((entries) => setGrid(toGrid(entries)))
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  function setLevel(department: Department, pageKey: string, level: AccessLevel) {
    setGrid((prev) => {
      if (!prev) return prev
      return { ...prev, [department]: { ...prev[department], [pageKey]: level } }
    })
  }

  function toggleRead(department: Department, pageKey: string, checked: boolean) {
    // Unchecking Read also clears Write, since write implies read --
    // there's no valid state where a department can edit a page it
    // can't even view.
    setLevel(department, pageKey, checked ? 'read' : 'none')
  }

  function toggleWrite(department: Department, pageKey: string, checked: boolean) {
    // Checking Write implies Read is granted too.
    setLevel(department, pageKey, checked ? 'write' : 'read')
  }

  async function handleSave() {
    if (!grid) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await updatePermissionMatrix(toEntries(grid))
      setGrid(toGrid(updated))
      setNotice('Access control saved.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} className="text-gold-300" />
      </div>
    )
  }

  if (!grid) {
    return <Alert variant="error">{error}</Alert>
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      <GlassCard className="p-8">
        <h2 className="font-display text-lg font-medium text-white">Access control</h2>
        <p className="mt-1 text-sm text-white/50">
          Governs what a <span className="text-white/70">staff</span> user can see and do, based on their
          department. Admins and managers always have full access to everything; viewers always have read-only
          access to everything -- neither is affected by this grid. A page with neither box checked is completely
          hidden from that department until you grant it here.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/50">
                <th className="py-2 pr-4 font-medium">Page</th>
                {DEPARTMENTS.map((dept) => (
                  <th key={dept.key} className="py-2 px-4 text-center font-medium">
                    {dept.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGE_LABELS.map(([pageKey, label]) => (
                <tr key={pageKey} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-white/80">{label}</td>
                  {DEPARTMENTS.map((dept) => {
                    const level = grid[dept.key][pageKey] ?? 'none'
                    return (
                      <td key={dept.key} className="py-3 px-4">
                        <div className="flex items-center justify-center gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-white/60">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-gold-400"
                              checked={level === 'read' || level === 'write'}
                              onChange={(e) => toggleRead(dept.key, pageKey, e.target.checked)}
                            />
                            Read
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-white/60">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-gold-400"
                              checked={level === 'write'}
                              onChange={(e) => toggleWrite(dept.key, pageKey, e.target.checked)}
                            />
                            Write
                          </label>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="flex justify-end">
        <Button type="button" isLoading={saving} onClick={handleSave}>
          Save access control
        </Button>
      </div>
    </div>
  )
}
