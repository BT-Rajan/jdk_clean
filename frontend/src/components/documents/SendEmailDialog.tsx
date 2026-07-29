import { useEffect, useState } from 'react'
import { Alert, Button, Modal, TextareaField, TextField } from '@/components/ui'
import { getApiErrorMessage } from '@/lib/apiError'

interface SendEmailDialogProps {
  open: boolean
  title: string
  defaultEmail?: string | null
  onSend: (toEmail: string, message: string) => Promise<void>
  onClose: () => void
}

/** Modal used by every document's "Send email" action. The caller's
 * onSend does the actual API call (and its own success notice); this
 * component only owns the recipient/message fields and inline error
 * display for a failed send. */
export function SendEmailDialog({ open, title, defaultEmail, onSend, onClose }: SendEmailDialogProps) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail ?? '')
      setMessage('')
      setError(null)
    }
  }, [open, defaultEmail])

  async function handleSend() {
    setError(null)
    setSending(true)
    try {
      await onSend(email, message)
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSending(false)
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
        <TextareaField
          label="Message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
    </Modal>
  )
}
