import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/ui'
import { MasterListPage, type MasterListColumn } from '@/components/master/MasterListPage'
import { listDepartments } from '@/api/departments'
import { listUsers } from '@/api/users'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import type { Department } from '@/types/department'
import type { User } from '@/types/auth'

interface DepartmentPeople {
  head?: User
  members: User[]
}

/** Department has no head/team-member columns of its own (see
 * types/department.ts) -- "Department Head" and "Team Members" are
 * derived from the existing User.department_id + User.role relationship
 * (role='department_head' / 'team_member'), the same relationship the
 * RBAC hardening pass introduced. No new organizational model, just a
 * client-side grouping of a page (page_size:200, same cap every other
 * "load every department/user for a dropdown" call in this app already
 * uses) fetched once. */
function useDepartmentPeople() {
  const [byDepartment, setByDepartment] = useState<Record<number, DepartmentPeople>>({})

  useEffect(() => {
    let cancelled = false
    listUsers({ page: 1, page_size: 200 }).then((res) => {
      if (cancelled) return
      const map: Record<number, DepartmentPeople> = {}
      for (const u of res.items) {
        if (!u.department_id) continue
        const entry = (map[u.department_id] ??= { members: [] })
        if (u.role === 'department_head') entry.head = u
        else if (u.role === 'team_member') entry.members.push(u)
      }
      setByDepartment(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return byDepartment
}

function formatMembers(members: User[]): string {
  if (members.length === 0) return '—'
  const names = members.map((m) => m.full_name)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
}

export function DepartmentsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const peopleByDepartment = useDepartmentPeople()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) =>
      listDepartments(params),
    [],
  )

  const columns: MasterListColumn<Department>[] = [
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      render: (d) => (
        <Link to={`/departments/${d.id}/edit`} className="font-medium text-gold-300 hover:text-gold-200">
          {d.code}
        </Link>
      ),
    },
    { key: 'name', label: 'Name', sortable: true, render: (d) => <span className="text-white">{d.name}</span> },
    { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
    {
      key: 'head',
      label: 'Department head',
      render: (d) => {
        const head = peopleByDepartment[d.id]?.head
        return head ? (
          <Link to={`/users/${head.id}`} className="text-gold-300 hover:text-gold-200">
            {head.full_name}
          </Link>
        ) : (
          <span className="text-white/40">—</span>
        )
      },
    },
    {
      key: 'members',
      label: 'Team members',
      render: (d) => <span className="text-white/60">{formatMembers(peopleByDepartment[d.id]?.members ?? [])}</span>,
    },
  ]

  return (
    <MasterListPage
      title="Departments"
      noun="departments"
      fetcher={fetcher}
      columns={columns}
      rowKey={(d) => d.id}
      searchPlaceholder="Code or name…"
      canCreate={isAdmin(user?.role)}
      createLabel="New department"
      onCreate={() => navigate('/departments/new')}
    />
  )
}
