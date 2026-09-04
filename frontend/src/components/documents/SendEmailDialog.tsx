import { useEffect, useState } from 'react'
import { Alert, Button, Modal, TextareaField, TextField } from '@/components/ui'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'
import { getApiErrorMessage } from '@/lib/apiError'

interface SendEmailDialogProps {
  open: boolean
  title: string
  defaultEmail?: string | null
  /** Pre-fills the message box -- e.g. the admin-configured template
   * already rendered for this document, so the sender previews the
   * real content instead of starting from a blank box. */
  defaultMessage?: string
  /** Shown read-only above the message box, for transparency on what
   * subject line will actually be used (not editable here). */
  subjectPreview?: string
  onSend: (toEmail: string, message: string, attachPdf: boolean) => Promise<void>
  onClose: () => void
}

/** Modal used by every document's "Send email" action. The caller's
 * onSend does the actual API call (and its own success notice); this
 * component only owns the recipient/message fields, the attach-PDF
 * toggle, and inline error display for a failed send. */
export function SendEmailDialog({
  open, title, defaultEmail, defaultMessage, subjectPreview, onSend, onClose,
}: SendEmailDialogProps) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [attachPdf, setAttachPdf] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { busy: sending, run: runGuarded } = useAsyncGuard()

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail ?? '')
      setMessage(defaultMessage ?? '')
      setAttachPdf(true)
      setError(null)
    }
    // Only the fields that seed this dialog's initial state on open --
    // re-running on every keystroke of defaultMessage would clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmail])

  async function handleSend() {
    setError(null)
    try {
      await runGuarded(async () => {
        await onSend(email, message, attachPdf)
        onClose()
      })
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} isLoading={sending}>Send</Button>
        </>
      }
    >
      <Alert variant="error">{error}</Alert>
      <div className="flex flex-col gap-4">
        <TextField
          label="Recipient email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {subjectPreview ? (
          <p className="text-sm text-white/60">
            <span className="text-white/40">Subject: </span>
            {subjectPreview}
          </p>
        ) : null}
        <TextareaField
          label="Message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <label className="flex items-center gap-3 text-sm text-white/70">
          <input
            type="checkbox"
            checked={attachPdf}
            onChange={(e) => setAttachPdf(e.target.checked)}
            className="h-4 w-4 rounded border-gold-400/30 bg-gold-500/10 accent-gold-400"
          />
          Attach PDF copy
        </label>
        {!attachPdf ? (
          <p className="-mt-2 text-xs text-white/40">
            Sends the message text only, no attachment -- useful if a recipient's mail
            server is blocking or dropping the PDF.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
