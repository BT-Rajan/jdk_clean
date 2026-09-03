import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Spinner } from '@/components/ui'
import { getDocTemplateHtml, saveDocTemplateHtml } from '@/api/docTemplates'
import type { DocTemplateSlot } from '@/types/docTemplate'
import { getApiErrorMessage } from '@/lib/apiError'
import { cn } from '@/lib/cn'

interface TemplateFieldMapperModalProps {
  /** null closes the modal. Passing a slot opens it pre-loaded for that
   * exact (doc_type, language) pair -- one modal instance is reused for
   * every slot rather than mounting eight of these up front. */
  slot: DocTemplateSlot | null
  onClose: () => void
  onSaved: (updated: DocTemplateSlot) => void
}

/** A field/row-marker chip in the left palette. onMouseDown must
 * preventDefault so clicking it never steals focus (and therefore the
 * text cursor position) away from the editor -- see insertAtCursor. */
function FieldChip({ label, onInsert }: { label: string; onInsert: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onInsert}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-white/70 transition-colors hover:border-gold-400/30 hover:bg-gold-500/10 hover:text-gold-100"
    >
      {label}
    </button>
  )
}

export function TemplateFieldMapperModal({ slot, onClose, onSaved }: TemplateFieldMapperModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  // Guards against an in-flight fetch from a previously opened slot
  // landing after the admin has already switched to (or closed) another.
  const requestSlotKey = useRef<string | null>(null)

  useEffect(() => {
    if (!slot) return
    const key = `${slot.doc_type}:${slot.language}`
    requestSlotKey.current = key
    setLoading(true)
    setError(null)
    getDocTemplateHtml(slot.doc_type, slot.language)
      .then((html) => {
        if (requestSlotKey.current !== key) return
        if (editorRef.current) editorRef.current.innerHTML = html
      })
      .catch((err) => {
        if (requestSlotKey.current !== key) return
        setError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (requestSlotKey.current === key) setLoading(false)
      })
  }, [slot])

  function insertAtCursor(token: string) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()

    const selection = window.getSelection()
    if (!selection) return
    const hasRangeInEditor = selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).commonAncestorContainer)
    if (!hasRangeInEditor) {
      // No prior cursor position inside the editor (first click, or focus
      // was elsewhere) -- drop the token at the end of the document
      // instead of wherever focus happened to land.
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    document.execCommand('insertText', false, token)
  }

  async function handleSave() {
    if (!slot || !editorRef.current) return
    setSaving(true)
    setError(null)
    try {
      const updated = await saveDocTemplateHtml(slot.doc_type, slot.language, editorRef.current.innerHTML)
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={slot !== null}
      onClose={onClose}
      title={slot ? `Map fields -- ${slot.doc_type_label} (${slot.language_label})` : 'Map fields'}
      fullPage
    >
      {slot && (
        <div className="flex h-[calc(100%-2.5rem)] flex-col gap-4">
          <p className="text-xs text-white/40">
            Click a field to insert it at your cursor. Everything else here is normal text you can type and
            format directly -- save writes this back as the custom template for this document.
          </p>

          <Alert variant="error">{error}</Alert>

          <div className="flex min-h-0 flex-1 gap-4">
            {/* Field palette */}
            <div className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto pr-1">
              <div>
                <h3 className="mb-2 font-display text-sm font-medium text-white">Document fields</h3>
                <div className="flex flex-col gap-1.5">
                  {slot.simple_fields.map((f) => (
                    <FieldChip key={f.key} label={f.label} onInsert={() => insertAtCursor(`{{ ${f.key} }}`)} />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-1 font-display text-sm font-medium text-white">
                  Repeating line ({slot.repeating.loop_name})
                </h3>
                <p className="mb-2 text-[11px] leading-snug text-white/40">
                  Place these inside a table row between the two markers below, one row per line item.
                </p>
                <div className="mb-2 flex flex-col gap-1.5">
                  <FieldChip
                    label="↳ Start repeating row"
                    onInsert={() => insertAtCursor(`{%tr for ${slot.repeating.item_label} in ${slot.repeating.loop_name} %}`)}
                  />
                  <FieldChip label="↲ End repeating row" onInsert={() => insertAtCursor('{%tr endfor %}')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {slot.repeating.fields.map((f) => (
                    <FieldChip
                      key={f.key}
                      label={f.label}
                      onInsert={() => insertAtCursor(`{{ ${slot.repeating.item_label}.${f.key} }}`)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Document editor */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white/5 p-4">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : (
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  dir={slot.language === 'ar' ? 'rtl' : 'ltr'}
                  className={cn(
                    'doc-template-editor min-h-full rounded-xl bg-white p-8 text-sm text-ink-950 shadow-lg focus:outline-none',
                    slot.language === 'ar' && 'text-right',
                  )}
                />
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={saving} disabled={loading}>
              Save template
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
