import { useEffect, useRef, useState } from 'react'
import { Alert, Button, ConfirmDialog, GlassCard, Spinner } from '@/components/ui'
import { downloadDocTemplate, listDocTemplates, resetDocTemplate, uploadDocTemplate } from '@/api/docTemplates'
import type { DocTemplateSlot, DocType } from '@/types/docTemplate'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import { cn } from '@/lib/cn'

const DOC_TYPE_ORDER: DocType[] = ['feasibility', 'quotation', 'order', 'delivery_note']

function SlotCard({ slot, onChanged }: { slot: DocTemplateSlot; onChanged: (updated: DocTemplateSlot) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setBusy(true)
    setError(null)
    try {
      onChanged(await uploadDocTemplate(slot.doc_type, slot.language, file))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    setBusy(true)
    setError(null)
    try {
      await downloadDocTemplate(slot.doc_type, slot.language)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setBusy(true)
    setError(null)
    try {
      onChanged(await resetDocTemplate(slot.doc_type, slot.language))
      setConfirmResetOpen(false)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-medium text-white">{slot.language_label}</h3>
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            slot.is_custom
              ? 'border-gold-400/30 bg-gold-500/10 text-gold-200'
              : 'border-white/10 bg-white/5 text-white/40',
          )}
        >
          {slot.is_custom ? 'Custom' : 'Default'}
        </span>
      </div>

      <p className="mb-3 min-h-[1rem] text-xs text-white/40">
        {slot.is_custom && slot.original_filename
          ? `${slot.original_filename} -- uploaded ${slot.updated_at ? formatDateTime(slot.updated_at) : ''}`
          : 'Using the bundled default template.'}
      </p>

      <Alert variant="error">{error}</Alert>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={handleDownload} isLoading={busy}>
          Download current
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          Upload new
        </Button>
        {slot.is_custom && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmResetOpen(true)} disabled={busy}>
            Reset to default
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleUpload(file)
        }}
      />

      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset to default"
        message={`Remove the custom ${slot.doc_type_label} (${slot.language_label}) template and go back to the bundled default?`}
        confirmLabel="Reset"
        danger
        busy={busy}
        onConfirm={handleReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </GlassCard>
  )
}

export function DocumentTemplatesTab() {
  const [slots, setSlots] = useState<DocTemplateSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listDocTemplates()
      .then(setSlots)
      .catch((err) => setError(getApiErrorMessage(err)))
  }, [])

  function updateSlot(updated: DocTemplateSlot) {
    setSlots((prev) =>
      prev!.map((s) => (s.doc_type === updated.doc_type && s.language === updated.language ? updated : s)),
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-white/50">
        The .docx layout each Feasibility Report, Quotation, Sales Order, and Delivery Note is generated from --
        one file per document type, per language. Upload your own .docx to replace either language's default: use{' '}
        <code className="rounded bg-white/10 px-1">{'{{ field }}'}</code> for a placeholder, and{' '}
        <code className="rounded bg-white/10 px-1">{'{%tr for line in lines %}'}</code> ...{' '}
        <code className="rounded bg-white/10 px-1">{'{%tr endfor %}'}</code> inside a table row to repeat it once
        per line item. "Download current" gets you the active file (custom or default) to edit and re-upload;
        "Reset to default" drops back to the bundled version.
      </p>

      <Alert variant="error">{error}</Alert>

      {slots === null ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        DOC_TYPE_ORDER.map((docType) => {
          const items = slots.filter((s) => s.doc_type === docType)
          if (items.length === 0) return null
          return (
            <div key={docType}>
              <h2 className="font-display text-lg font-medium text-white">{items[0].doc_type_label}</h2>
              <p className="mt-1 mb-3 text-xs text-white/40">Available placeholders: {items[0].placeholders}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {items.map((slot) => (
                  <SlotCard key={`${slot.doc_type}-${slot.language}`} slot={slot} onChanged={updateSlot} />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
