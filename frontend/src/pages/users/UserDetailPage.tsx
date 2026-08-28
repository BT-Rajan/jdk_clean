import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { deleteUser, getUser, restoreUser } from '@/api/users'
import type { User } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'

export function UserDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const navigate = useNavigate()
  const { user: viewer } = useAuth()

  const [record, setRecord] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getUser(userId)
      .then(setRecord)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [userId])

  const isSelf = viewer?.id === userId

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteUser(userId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('User deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreUser(userId)
      setRecord(restored)
      setJustDeleted(false)
      setNotice('User restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Spinner size={28} className="text-gold-300" />
        </div>
      </AppLayout>
    )
  }

  if (!record) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'User not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageHeader
        title={record.full_name}
        subtitle={`@${record.username}`}
        actions={
          !justDeleted ? (
            <>
              <Button variant="ghost" onClick={() => navigate(`/users/${userId}/edit`)}>Edit</Button>
              {!isSelf && (
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
              )}
            </>
          ) : undefined
        }
      />

      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span>{notice}</span>
          {justDeleted && (
            <button type="button" onClick={handleRestore} className="font-medium text-gold-300 underline">Undo</button>
          )}
        </div>
      )}

      <GlassCard className="p-8">
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Email" value={record.email} />
          <Field label="Role" value={<Badge tone="gold">{record.role}</Badge>} />
          <Field label="Status" value={<Badge tone={record.is_active ? 'success' : 'neutral'}>{record.is_active ? 'active' : 'inactive'}</Badge>} />
        </dl>
      </GlassCard>

      {isAdmin(viewer?.role) && (
        <div className="mt-6">
          <HistoryTimeline resourcePath="/api/users" id={userId} />
        </div>
      )}

      <div className="mt-6">
        <Link to="/admin?section=users" className="text-sm text-white/50 hover:text-white">← Back to users</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete user"
        message={`Delete ${record.full_name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
