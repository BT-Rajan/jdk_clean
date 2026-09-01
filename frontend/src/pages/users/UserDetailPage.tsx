import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  GlassCard,
  Modal,
  PageHeader,
  PasswordField,
  Spinner,
} from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { deleteUser, fetchUserSignatureBlob, getUser, resetUserPassword, restoreUser } from '@/api/users'
import type { User } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import {
  adminResetPasswordSchema,
  type AdminResetPasswordFormValues,
} from '@/lib/validation'

/** Admin-only (matches the backend's admin_strict on POST
 * /api/users/{id}/reset-password -- stricter than the admin+manager
 * gate on the rest of this page, see app/api/users.py). Sets a new
 * password directly, no current password required -- the
 * account-recovery path for a locked-out user. */
function ResetPasswordDialog({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdminResetPasswordFormValues>({ resolver: zodResolver(adminResetPasswordSchema) })

  function handleClose() {
    reset()
    setFormError(null)
    setSucceeded(false)
    onClose()
  }

  async function onSubmit(values: AdminResetPasswordFormValues) {
    setFormError(null)
    try {
      await resetUserPassword(user.id, values.new_password)
      setSucceeded(true)
      reset()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <Modal open={open} title={`Reset password for ${user.full_name}`} onClose={handleClose}>
      <Alert variant="error">{formError}</Alert>
      {succeeded ? (
        <>
          <Alert variant="success">{`Password reset. Share the new password with ${user.full_name} directly.`}</Alert>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-white/50">
            This sets a new password immediately -- no current password required. Use this to recover a locked-out
            account.
          </p>
          <PasswordField label="New password" error={errors.new_password?.message} {...register('new_password')} />
          <PasswordField
            label="Confirm password"
            error={errors.confirm_password?.message}
            {...register('confirm_password')}
          />
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Reset password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** Read-only signature preview -- same fetch-as-blob pattern as
 * UserFormPage's SignatureManager, but without the upload/remove
 * controls (those stay in Edit, this is just "does one exist"). */
function SignaturePreview({ user }: { user: User }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!user.has_signature) {
      setPreviewUrl(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    fetchUserSignatureBlob(user.id).then((blob) => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setPreviewUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [user.id, user.has_signature])

  if (!user.has_signature) {
    return <span className="text-white/40">Not set</span>
  }
  return (
    <div className="flex h-12 w-32 items-center justify-center rounded-lg border border-white/10 bg-white/95">
      {previewUrl ? (
        <img src={previewUrl} alt="Signature" className="max-h-10 max-w-28 object-contain" />
      ) : (
        <Spinner size={14} className="text-ink-950/40" />
      )}
    </div>
  )
}

export function UserDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const navigate = useNavigate()
  const { user: viewer } = useAuth()

  const [record, setRecord] = useState<User | null>(null)
  const [manager, setManager] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getUser(userId)
      .then(setRecord)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [userId])

  // "Reports to" -- UserOut only carries manager_id, not the manager's
  // name (see backend/app/schemas/user.py), so resolve it with one more
  // admin-only lookup. Reassignment itself happens from Admin -> Org
  // chart, not here (see pages/settings/OrgChartTab.tsx) -- this is
  // display-only.
  useEffect(() => {
    if (!record?.manager_id) {
      setManager(null)
      return
    }
    let cancelled = false
    getUser(record.manager_id)
      .then((m) => {
        if (!cancelled) setManager(m)
      })
      .catch(() => {
        if (!cancelled) setManager(null)
      })
    return () => {
      cancelled = true
    }
  }, [record?.manager_id])

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
              {isAdmin(viewer?.role) && (
                <Button variant="ghost" onClick={() => setResetOpen(true)}>
                  Reset password
                </Button>
              )}
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
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Email" value={record.email} />
          <Field label="Phone" value={record.phone ?? undefined} />
          <Field label="Role" value={<Badge tone="gold">{record.role}</Badge>} />
          <Field label="Department" value={record.department_name ?? undefined} />
          <Field
            label="Reports to"
            value={
              record.manager_id ? (
                manager ? (
                  <Link to={`/users/${manager.id}`} className="text-gold-300 hover:text-gold-200">
                    {manager.full_name}
                  </Link>
                ) : (
                  <Spinner size={12} className="text-white/40" />
                )
              ) : undefined
            }
          />
          <Field label="Status" value={<Badge tone={record.is_active ? 'success' : 'neutral'}>{record.is_active ? 'active' : 'inactive'}</Badge>} />
          <Field label="Signature">
            <SignaturePreview user={record} />
          </Field>
        </dl>
        <p className="mt-6 text-xs text-white/30">
          Department and reporting-line assignments are managed from{' '}
          <Link to="/admin?section=org-chart" className="text-gold-300 hover:text-gold-200">
            Admin → Org chart
          </Link>
          .
        </p>
      </GlassCard>

      {isAdmin(viewer?.role) && (
        <div className="mt-6">
          <HistoryTimeline resourcePath="/api/users" id={userId} />
        </div>
      )}

      <div className="mt-6">
        <Link to="/users" className="text-sm text-white/50 hover:text-white">← Back to users</Link>
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

      <ResetPasswordDialog user={record} open={resetOpen} onClose={() => setResetOpen(false)} />
    </AppLayout>
  )
}
