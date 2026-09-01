import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, GlassCard, Spinner } from '@/components/ui'
import { listDepartments } from '@/api/departments'
import { listUsers, updateUser } from '@/api/users'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import type { User } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/apiError'

/** The "Unassigned" drop target uses this in place of a real manager id --
 * dropping a Member here sends manager_id: null (see handleDrop). */
const UNASSIGNED = 'unassigned'

/** Compact department picker used inside chart nodes -- deliberately not
 * the shared SelectField (that always renders a full label block, too
 * tall for a chart card). This is the "access bundle" dropdown from the
 * spec: it just writes the user's existing `department_id`, which is
 * exactly what Access Control's permission matrix already keys off of
 * (see AccessControlTab) -- no new bundle concept, reusing what's there.
 */
function DepartmentSelect({
  value,
  disabled,
  onChange,
}: {
  value: number | null
  disabled: boolean
  onChange: (value: number | null) => void
}) {
  const fetcher = useCallback(() => listDepartments({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: departments } = useSelectOptions(fetcher)
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
  dragging: boolean
  saving: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDepartmentChange: (departmentId: number | null) => void
}

function MemberCard({ user, dragging, saving, onDragStart, onDragEnd, onDepartmentChange }: MemberCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(user.id))
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-opacity active:cursor-grabbing ${
        dragging ? 'opacity-40' : 'opacity-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
          <p className="truncate text-xs text-white/40">{user.username}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {saving && <Spinner size={12} className="text-gold-300" />}
          <Badge tone={user.role === 'viewer' ? 'neutral' : 'info'}>{user.role}</Badge>
          {!user.is_active && <Badge tone="danger">Inactive</Badge>}
        </div>
      </div>
      <div className="mt-2">
        <DepartmentSelect value={user.department_id} disabled={saving} onChange={onDepartmentChange} />
      </div>
    </div>
  )
}

export function OrgChartTab() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())

  function load() {
    setError(null)
    // Every user fits comfortably in one page for a chart like this --
    // a large page_size avoids needing pagination inside chart columns.
    // Capped at 200 to match the backend's ListParams page_size limit
    // (see app/api/deps.py) -- if the org ever exceeds 200 users, this
    // will need real pagination or a dedicated uncapped endpoint.
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
    return dragOverKey === key
      ? 'border-gold-400/60 bg-gold-400/5'
      : 'border-white/10'
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

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-8">
        <h2 className="font-display text-lg font-medium text-white">Org chart</h2>
        <p className="mt-1 text-sm text-white/50">
          Drag a member onto a different manager (or into "Unassigned") to change who they report to. Each person's
          department dropdown feeds the same access-control matrix as{' '}
          <Link to="/roles-permissions" className="text-gold-300 hover:text-gold-200">
            Roles &amp; Permissions
          </Link>{' '}
          -- change it here or there, it's the same setting. Roles themselves (Owner/Manager/Member) are set from{' '}
          <Link to="/users" className="text-gold-300 hover:text-gold-200">
            Users
          </Link>
          , not by dragging.
        </p>

        <Alert variant="error">{error}</Alert>

        {/* Owner tier */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <span className="text-[10px] font-medium tracking-wide text-white/30 uppercase">Owner</span>
          <div className="flex flex-wrap justify-center gap-3">
            {owners.length === 0 ? (
              <p className="text-sm text-white/40">No admin user found.</p>
            ) : (
              owners.map((owner) => (
                <div
                  key={owner.id}
                  className="rounded-xl border border-gold-400/30 bg-gold-500/10 px-5 py-3 text-center"
                >
                  <p className="text-sm font-medium text-gold-200">{owner.full_name}</p>
                  <p className="text-xs text-gold-200/50">{owner.username}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Connector */}
        <div className="mx-auto mt-3 h-6 w-px bg-white/10" />

        {/* Manager tier, each with its members dropped inside */}
        {managers.length === 0 ? (
          <p className="mt-3 py-6 text-center text-sm text-white/40">
            No managers yet -- add one from{' '}
            <Link to="/users" className="text-gold-300 hover:text-gold-200">
              Users
            </Link>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {managers.map((manager) => {
              const key = `manager-${manager.id}`
              const reports = membersByManager.get(manager.id) ?? []
              return (
                <div
                  key={manager.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverKey(key)
                  }}
                  onDragLeave={() => setDragOverKey((prev) => (prev === key ? null : prev))}
                  onDrop={handleDrop(manager.id)}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors ${dropZoneClasses(key)}`}
                >
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-violet-200">{manager.full_name}</p>
                        <p className="truncate text-xs text-violet-200/50">{manager.username}</p>
                      </div>
                      {pendingIds.has(manager.id) && <Spinner size={12} className="text-violet-200" />}
                    </div>
                    <div className="mt-2">
                      <DepartmentSelect
                        value={manager.department_id}
                        disabled={pendingIds.has(manager.id)}
                        onChange={(department_id) => patchUser(manager.id, { department_id })}
                      />
                    </div>
                  </div>

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
              )
            })}
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
        className={`p-6 transition-colors ${dropZoneClasses(UNASSIGNED)}`}
      >
        <h3 className="font-display text-sm font-medium text-white/70">Unassigned members</h3>
        <p className="mt-1 text-xs text-white/40">Members not yet placed under a manager.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {unassigned.length === 0 ? (
            <p className="text-sm text-white/30">Everyone's assigned.</p>
          ) : (
            unassigned.map((member) => (
              <MemberCard
                key={member.id}
                user={member}
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
