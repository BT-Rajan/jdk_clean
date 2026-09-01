import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Avatar, EmptyState, GlassCard, Spinner } from '@/components/ui'
import { listDepartments } from '@/api/departments'
import { listUsers, updateUser } from '@/api/users'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import type { User } from '@/types/auth'
import type { Department } from '@/types/department'
import { getApiErrorMessage } from '@/lib/apiError'
import { cn } from '@/lib/cn'

/** The "Unassigned" drop target uses this in place of a real manager id --
 * dropping a Member here sends manager_id: null (see handleDrop). */
const UNASSIGNED = 'unassigned'

/** Color coding for departments -- distinct from the gold/violet tiers
 * used for Owner/Manager rank, so "which department" and "which rank"
 * read as two separate visual dimensions on a card rather than
 * competing for the same color. Cycled by each active department's
 * position in the (id-ordered) list, so it's stable regardless of how
 * many departments exist -- the whole point of this chart is that this
 * list is expected to grow past today's four. */
const DEPARTMENT_PALETTE = [
  { dot: 'bg-emerald-400', text: 'text-emerald-200', border: 'border-l-emerald-400/70' },
  { dot: 'bg-sky-400', text: 'text-sky-200', border: 'border-l-sky-400/70' },
  { dot: 'bg-rose-400', text: 'text-rose-200', border: 'border-l-rose-400/70' },
  { dot: 'bg-amber-400', text: 'text-amber-200', border: 'border-l-amber-400/70' },
  { dot: 'bg-cyan-400', text: 'text-cyan-200', border: 'border-l-cyan-400/70' },
  { dot: 'bg-pink-400', text: 'text-pink-200', border: 'border-l-pink-400/70' },
]
const NO_DEPARTMENT_STYLE = { dot: 'bg-white/25', text: 'text-white/40', border: 'border-l-white/10' }

function useDepartmentStyles(departments: Department[]) {
  return useMemo(() => {
    const sorted = [...departments].sort((a, b) => a.id - b.id)
    const map = new Map<number, (typeof DEPARTMENT_PALETTE)[number]>()
    sorted.forEach((dept, i) => map.set(dept.id, DEPARTMENT_PALETTE[i % DEPARTMENT_PALETTE.length]!))
    return map
  }, [departments])
}

/** Compact department picker used inside chart nodes -- deliberately not
 * the shared SelectField (that always renders a full label block, too
 * tall for a chart card). This is the "access bundle" dropdown from the
 * spec: it just writes the user's existing `department_id`, which is
 * exactly what Access Control's permission matrix already keys off of
 * (see AccessControlTab) -- no new bundle concept, reusing what's there.
 */
function DepartmentSelect({
  departments,
  value,
  disabled,
  onChange,
}: {
  departments: Department[]
  value: number | null
  disabled: boolean
  onChange: (value: number | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white/80 outline-none transition-colors focus:border-gold-400/60 disabled:opacity-50 [&>option]:bg-ink-800"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">No department</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  )
}

interface MemberCardProps {
  user: User
  deptStyle: (typeof DEPARTMENT_PALETTE)[number]
  departments: Department[]
  dragging: boolean
  saving: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDepartmentChange: (departmentId: number | null) => void
}

function MemberCard({
  user,
  deptStyle,
  departments,
  dragging,
  saving,
  onDragStart,
  onDragEnd,
  onDepartmentChange,
}: MemberCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(user.id))
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'cursor-grab rounded-xl border border-white/10 border-l-2 bg-white/[0.04] p-3 transition-opacity active:cursor-grabbing',
        deptStyle.border,
        dragging ? 'opacity-40' : 'opacity-100',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar avatarUrl={user.avatar_url} name={user.full_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
          <p className="truncate text-xs text-white/40">{user.username}</p>
        </div>
        {saving && <Spinner size={12} className="shrink-0 text-gold-300" />}
        {!user.is_active && (
          <span className="shrink-0 rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-200">
            Inactive
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 pl-[42px] text-[10px] text-white/35">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', deptStyle.dot)} />
        <span className="truncate">{user.department_name ?? 'No department'}</span>
      </div>
      <div className="mt-2">
        <DepartmentSelect departments={departments} value={user.department_id} disabled={saving} onChange={onDepartmentChange} />
      </div>
    </div>
  )
}

/** Vertical connector segment used between every tier of the tree --
 * one visual language (a thin gold-tinted stem) for "reports to",
 * repeated at every level, is what makes the layout read as an org
 * chart rather than a stack of unrelated card groups. */
function Stem({ className }: { className?: string }) {
  return <div className={cn('mx-auto w-px bg-white/15', className)} />
}

export function OrgChartTab() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')

  const departmentsFetcher = useCallback(() => listDepartments({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: departments } = useSelectOptions(departmentsFetcher)
  const deptStyles = useDepartmentStyles(departments)
  const styleFor = (departmentId: number | null) =>
    (departmentId != null && deptStyles.get(departmentId)) || NO_DEPARTMENT_STYLE

  function load() {
    setError(null)
    // Every user fits comfortably in one page for a chart like this --
    // a large page_size avoids needing pagination inside chart columns.
    // Capped at 200 to match the backend's ListParams page_size limit
    // (see app/api/deps.py) -- JDK headcount will never exceed 100, so
    // this is a safe permanent ceiling.
    listUsers({ page: 1, page_size: 200, sort: 'full_name' })
      .then((res) => setUsers(res.items))
      .catch((err) => setError(getApiErrorMessage(err)))
  }

  useEffect(load, [])

  const { owners, managers, membersByManager, unassigned } = useMemo(() => {
    const list = users ?? []
    const owners = list.filter((u) => u.role === 'admin')
    const managers = list.filter((u) => u.role === 'manager')
    const managerIds = new Set(managers.map((m) => m.id))
    const members = list.filter((u) => u.role === 'staff' || u.role === 'viewer')
    const membersByManager = new Map<number, User[]>()
    const unassigned: User[] = []
    for (const member of members) {
      // A member_id pointing at a manager who no longer exists/was
      // re-roled falls back to the Unassigned tray rather than vanishing.
      if (member.manager_id != null && managerIds.has(member.manager_id)) {
        const bucket = membersByManager.get(member.manager_id) ?? []
        bucket.push(member)
        membersByManager.set(member.manager_id, bucket)
      } else {
        unassigned.push(member)
      }
    }
    return { owners, managers, membersByManager, unassigned }
  }, [users])

  const q = query.trim().toLowerCase()
  const matches = useCallback(
    (u: User) => !q || u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    [q],
  )

  // Searching narrows the tree to relevant people while keeping enough
  // context to still read as a chart: a matched manager keeps their full
  // team visible, while a matched report pulls in just their manager as
  // context (not the manager's whole team).
  const visibleOwners = useMemo(() => (q ? owners.filter(matches) : owners), [owners, matches, q])
  const visibleManagers = useMemo(
    () =>
      q
        ? managers.filter((m) => matches(m) || (membersByManager.get(m.id) ?? []).some(matches))
        : managers,
    [managers, membersByManager, matches, q],
  )
  const reportsFor = useCallback(
    (manager: User) => {
      const reports = membersByManager.get(manager.id) ?? []
      return q && !matches(manager) ? reports.filter(matches) : reports
    },
    [membersByManager, matches, q],
  )
  const visibleUnassigned = useMemo(() => (q ? unassigned.filter(matches) : unassigned), [unassigned, matches, q])

  const departmentCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const u of users ?? []) {
      if (u.department_id != null) counts.set(u.department_id, (counts.get(u.department_id) ?? 0) + 1)
    }
    return counts
  }, [users])

  function setPending(id: number, isPending: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (isPending) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /** Optimistic single-field patch shared by drag-and-drop reassignment
   * and the department dropdown -- updates local state immediately,
   * reverts it and surfaces the error if the backend rejects the write
   * (e.g. dropping a member onto a manager who's since gone inactive). */
  async function patchUser(id: number, patch: { manager_id?: number | null; department_id?: number | null }) {
    const previous = users
    setUsers((prev) => (prev ? prev.map((u) => (u.id === id ? { ...u, ...patch } : u)) : prev))
    setPending(id, true)
    setError(null)
    try {
      const updated = await updateUser(id, patch)
      setUsers((prev) => (prev ? prev.map((u) => (u.id === id ? updated : u)) : prev))
    } catch (err) {
      setUsers(previous)
      setError(getApiErrorMessage(err))
    } finally {
      setPending(id, false)
    }
  }

  function handleDrop(managerId: number | null) {
    return (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverKey(null)
      const raw = e.dataTransfer.getData('text/plain')
      const id = Number(raw)
      if (!id) return
      const dragged = users?.find((u) => u.id === id)
      if (!dragged || (dragged.role !== 'staff' && dragged.role !== 'viewer')) return
      if (dragged.manager_id === managerId) return
      patchUser(id, { manager_id: managerId })
    }
  }

  function dropZoneClasses(key: string) {
    return dragOverKey === key ? 'border-gold-400/60 bg-gold-400/5' : 'border-white/10'
  }

  if (error && !users) {
    return <Alert variant="error">{error}</Alert>
  }

  if (!users) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} className="text-gold-300" />
      </div>
    )
  }

  const noSearchResults =
    q && visibleOwners.length === 0 && visibleManagers.length === 0 && visibleUnassigned.length === 0

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-white">Org chart</h2>
            <p className="mt-1 max-w-2xl text-sm text-white/50">
              Drag a member onto a different manager (or into "Unassigned") to change who they report to. Each
              person's department dropdown feeds the same access-control matrix as{' '}
              <Link to="/roles-permissions" className="text-gold-300 hover:text-gold-200">
                Roles &amp; Permissions
              </Link>{' '}
              -- change it here or there, it's the same setting. Roles themselves (Owner/Manager/Member) are set
              from{' '}
              <Link to="/users" className="text-gold-300 hover:text-gold-200">
                Users
              </Link>
              , not by dragging.
            </p>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people..."
            className="h-9 w-full max-w-[220px] rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-gold-400/60"
          />
        </div>

        {/* Department legend -- the chart's color key, and the clearest
            place to see every department that exists (including ones
            with nobody in them yet) rather than only the ones that
            happen to show up on a card somewhere below. */}
        {departments.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 pt-4">
            {[...departments]
              .sort((a, b) => a.id - b.id)
              .map((dept) => (
                <div key={dept.id} className="flex items-center gap-1.5 text-xs text-white/50">
                  <span className={cn('h-2 w-2 rounded-full', styleFor(dept.id).dot)} />
                  <span className="text-white/70">{dept.name}</span>
                  <span className="text-white/30">({departmentCounts.get(dept.id) ?? 0})</span>
                </div>
              ))}
          </div>
        )}

        <Alert variant="error">{error}</Alert>

        {noSearchResults ? (
          <EmptyState title="No matches" message={`Nobody's name or username matches "${query}".`} />
        ) : (
          <div className="mt-8 flex flex-col items-center">
            {/* Owner tier */}
            <div className="flex flex-col items-center gap-3">
              <span className="text-[10px] font-medium tracking-wide text-white/30 uppercase">Owner</span>
              <div className="flex flex-wrap justify-center gap-3">
                {visibleOwners.length === 0 ? (
                  <p className="text-sm text-white/40">{q ? 'No matching owner.' : 'No admin user found.'}</p>
                ) : (
                  visibleOwners.map((owner) => (
                    <div
                      key={owner.id}
                      className="flex items-center gap-2.5 rounded-xl border border-gold-400/30 bg-gold-500/10 px-5 py-3"
                    >
                      <Avatar avatarUrl={owner.avatar_url} name={owner.full_name} size="sm" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-gold-200">{owner.full_name}</p>
                        <p className="text-xs text-gold-200/50">{owner.username}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Manager tier, connected to Owner by a trunk stem and to
                each other by a shared horizontal branch line -- laid out
                as a non-wrapping row (scrolling sideways past a handful
                of managers) so the connector geometry stays exact
                instead of breaking apart at responsive breakpoints. */}
            {visibleManagers.length === 0 ? (
              managers.length === 0 && (
                <>
                  <Stem className="mt-3 h-6" />
                  <p className="py-6 text-center text-sm text-white/40">
                    No managers yet -- add one from{' '}
                    <Link to="/users" className="text-gold-300 hover:text-gold-200">
                      Users
                    </Link>
                    .
                  </p>
                </>
              )
            ) : (
              <>
                <Stem className="h-6" />
                <div className="w-full overflow-x-auto pb-2">
                  <div className="relative mx-auto flex w-max justify-center gap-8 border-t border-white/15 pt-6">
                    {visibleManagers.map((manager) => {
                      const key = `manager-${manager.id}`
                      const reports = reportsFor(manager)
                      return (
                        <div key={manager.id} className="flex w-64 flex-col items-center">
                          <Stem className="h-6" />
                          <div
                            onDragOver={(e) => {
                              e.preventDefault()
                              setDragOverKey(key)
                            }}
                            onDragLeave={() => setDragOverKey((prev) => (prev === key ? null : prev))}
                            onDrop={handleDrop(manager.id)}
                            className={cn(
                              'flex w-full flex-col gap-3 rounded-2xl border p-4 transition-colors',
                              dropZoneClasses(key),
                            )}
                          >
                            <div
                              className={cn(
                                'rounded-xl border border-l-2 border-violet-500/30 bg-violet-500/10 p-3',
                                styleFor(manager.department_id).border,
                              )}
                            >
                              <div className="flex items-center gap-2.5">
                                <Avatar avatarUrl={manager.avatar_url} name={manager.full_name} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-violet-200">{manager.full_name}</p>
                                  <p className="truncate text-xs text-violet-200/50">{manager.username}</p>
                                </div>
                                {pendingIds.has(manager.id) && <Spinner size={12} className="shrink-0 text-violet-200" />}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5 pl-[42px] text-[10px] text-violet-200/40">
                                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styleFor(manager.department_id).dot)} />
                                <span className="truncate">{manager.department_name ?? 'No department'}</span>
                              </div>
                              <div className="mt-2">
                                <DepartmentSelect
                                  departments={departments}
                                  value={manager.department_id}
                                  disabled={pendingIds.has(manager.id)}
                                  onChange={(department_id) => patchUser(manager.id, { department_id })}
                                />
                              </div>
                            </div>

                            {reports.length > 0 && <Stem className="h-4" />}
                            <div className="flex min-h-[64px] flex-col gap-2">
                              {reports.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/30">
                                  Drop a member here
                                </p>
                              ) : (
                                reports.map((member) => (
                                  <MemberCard
                                    key={member.id}
                                    user={member}
                                    deptStyle={styleFor(member.department_id)}
                                    departments={departments}
                                    dragging={draggingId === member.id}
                                    saving={pendingIds.has(member.id)}
                                    onDragStart={() => setDraggingId(member.id)}
                                    onDragEnd={() => setDraggingId(null)}
                                    onDepartmentChange={(department_id) => patchUser(member.id, { department_id })}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </GlassCard>

      {/* Unassigned tray -- always visible as a drop target even when empty */}
      <GlassCard
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverKey(UNASSIGNED)
        }}
        onDragLeave={() => setDragOverKey((prev) => (prev === UNASSIGNED ? null : prev))}
        onDrop={handleDrop(null)}
        className={cn('p-6 transition-colors', dropZoneClasses(UNASSIGNED))}
      >
        <h3 className="font-display text-sm font-medium text-white/70">Unassigned members</h3>
        <p className="mt-1 text-xs text-white/40">Members not yet placed under a manager.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleUnassigned.length === 0 ? (
            <p className="text-sm text-white/30">{q ? 'No matches here.' : "Everyone's assigned."}</p>
          ) : (
            visibleUnassigned.map((member) => (
              <MemberCard
                key={member.id}
                user={member}
                deptStyle={styleFor(member.department_id)}
                departments={departments}
                dragging={draggingId === member.id}
                saving={pendingIds.has(member.id)}
                onDragStart={() => setDraggingId(member.id)}
                onDragEnd={() => setDraggingId(null)}
                onDepartmentChange={(department_id) => patchUser(member.id, { department_id })}
              />
            ))
          )}
        </div>
      </GlassCard>
    </div>
  )
}
