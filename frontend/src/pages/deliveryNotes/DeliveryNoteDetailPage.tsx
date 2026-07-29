import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge, TextField } from '@/components/ui'
import { SendEmailDialog } from '@/components/documents/SendEmailDialog'
import {
  deleteDeliveryNote,
  downloadDeliveryNotePdf,
  emailDeliveryNote,
  getDeliveryNote,
  restoreDeliveryNote,
  updateDeliveryNote,
  updateDeliveryNoteStatus,
} from '@/api/deliveryNotes'
import type { DeliveryNote } from '@/types/deliveryNote'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { DELIVERY_NOTE_TRANSITIONS } from '@/lib/statusTransitions'

export function DeliveryNoteDetailPage() {
  const { id } = useParams()
  const noteId = Number(id)
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'warehouse')

  const [note, setNote] = useState<DeliveryNote | null>(null)
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)

  function load() {
    setLoading(true)
    getDeliveryNote(noteId)
      .then((n) => {
        setNote(n)
        const q: Record<number, string> = {}
        for (const line of n.lines) q[line.id] = String(line.quantity_delivered)
        setQuantities(q)
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [noteId])

  async function handleSaveQuantities() {
    if (!note) return
    setBusy(true)
    setError(null)
    try {
      const lines = note.lines.map((l) => ({
        product_id: l.product_id,
        quantity_delivered: Number(quantities[l.id] ?? l.quantity_delivered),
      }))
      const updated = await updateDeliveryNote(noteId, { lines })
      setNote(updated)
      setNotice('Delivered quantities saved.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleStatusChange(status: 'issued' | 'cancelled') {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateDeliveryNoteStatus(noteId, status)
      setNote(updated)
      setNotice(
        status === 'issued'
          ? 'Delivery note issued. The order has been marked shipped and stock updated.'
          : 'Delivery note cancelled.',
      )
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteDeliveryNote(noteId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Delivery note deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreDeliveryNote(noteId)
      setNote(restored)
      setJustDeleted(false)
      setNotice('Delivery note restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    if (!note) return
    setBusy(true)
    try {
      await downloadDeliveryNotePdf(note.id, note.delivery_note_number)
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

  if (!note) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Delivery note not found.'}</Alert>
      </AppLayout>
    )
  }

  const nextStatuses = DELIVERY_NOTE_TRANSITIONS[note.status]
  const isDraft = note.status === 'draft'

  return (
    <AppLayout>
      <PageHeader
        title={note.delivery_note_number}
        subtitle={note.customer_name ?? undefined}
        actions={
          !justDeleted ? (
            <>
              <Button variant="ghost" onClick={handleDownload} isLoading={busy}>Download PDF</Button>
              <Button variant="ghost" onClick={() => setEmailOpen(true)}>Send email</Button>
              {allowWrite && isDraft && (
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
          {justDeleted && allowWrite && (
            <button type="button" onClick={handleRestore} className="font-medium text-gold-300 underline">Undo</button>
          )}
        </div>
      )}

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={note.status} />
          {allowWrite && !justDeleted && nextStatuses.length > 0 && (
            <div className="ml-auto flex gap-2">
              {nextStatuses.map((s) => (
                <Button key={s} variant="ghost" size="sm" isLoading={busy} onClick={() => handleStatusChange(s)}>
                  {s === 'issued' ? 'Issue' : 'Cancel'}
                </Button>
              ))}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Order" value={note.order_number} />
          <Field label="Delivery date" value={formatDate(note.delivery_date)} />
          <Field label="Notes" value={note.notes} />
        </dl>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="px-6 py-4 font-medium">Product</th>
                <th className="px-6 py-4 font-medium">Quantity delivered</th>
              </tr>
            </thead>
            <tbody>
              {note.lines.map((line) => (
                <tr key={line.id} className="border-b border-white/5 last:border-0">
                  <td className="px-6 py-4 text-white">
                    {line.product_code} — {line.product_name}
                  </td>
                  <td className="px-6 py-4">
                    {allowWrite && isDraft ? (
                      <div className="w-32">
                        <TextField
                          label=""
                          type="number"
                          step="0.0001"
                          value={quantities[line.id] ?? ''}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        />
                      </div>
                    ) : (
                      <span className="text-white/60">{line.quantity_delivered} {line.unit}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allowWrite && isDraft && (
          <div className="flex justify-end border-t border-white/10 px-6 py-4">
            <Button isLoading={busy} onClick={handleSaveQuantities}>Save changes</Button>
          </div>
        )}
      </GlassCard>

      <div className="mt-6">
        <Link to="/delivery-notes" className="text-sm text-white/50 hover:text-white">← Back to delivery notes</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete delivery note"
        message={`Delete ${note.delivery_note_number}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <SendEmailDialog
        open={emailOpen}
        title={`Email ${note.delivery_note_number}`}
        defaultEmail={note.customer_email}
        onClose={() => setEmailOpen(false)}
        onSend={async (toEmail, message) => {
          await emailDeliveryNote(note.id, toEmail, message)
          setNotice(`Emailed to ${toEmail}.`)
        }}
      />
    </AppLayout>
  )
}
