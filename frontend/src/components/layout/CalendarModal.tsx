import { useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, Modal, TextField, TextareaField } from '@/components/ui'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  downloadCalendarIcs,
  listCalendarEvents,
  listMentionableUsers,
  updateCalendarEvent,
} from '@/api/calendar'
import type { CalendarEvent, MentionableUser } from '@/types/calendar'
import { getMonthGrid, isPastDate, isToday, MONTH_LABELS, toISODate, WEEKDAY_LABELS } from '@/lib/calendarGrid'
import { getApiErrorMessage } from '@/lib/apiError'
import { cn } from '@/lib/cn'

interface CalendarModalProps {
  open: boolean
  onClose: () => void
}

const EMPTY_FORM = { title: '', notes: '' }

export function CalendarModal({ open, onClose }: CalendarModalProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1) // 1-12
  const [selectedDate, setSelectedDate] = useState(toISODate(today))

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Reset to the current month/day every time the calendar is opened, so
  // it doesn't reopen wherever it was last left.
  useEffect(() => {
    if (!open) return
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth() + 1)
    setSelectedDate(toISODate(now))
    setForm(EMPTY_FORM)
    setEditingId(null)
    setSaveError(null)
    listMentionableUsers()
      .then(setMentionableUsers)
      .catch(() => setMentionableUsers([]))
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    listCalendarEvents(viewYear, viewMonth)
      .then((items) => {
        if (!cancelled) {
          setEvents(items)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, viewYear, viewMonth])

  function refetch() {
    listCalendarEvents(viewYear, viewMonth)
      .then(setEvents)
      .catch((err) => setError(getApiErrorMessage(err)))
  }

  function goToMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    if (m > 12) {
      m = 1
      y += 1
    } else if (m < 1) {
      m = 12
      y -= 1
    }
    setViewMonth(m)
    setViewYear(y)
  }

  function goToday() {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth() + 1)
    setSelectedDate(toISODate(now))
  }

  function selectDay(iso: string) {
    setSelectedDate(iso)
    setForm(EMPTY_FORM)
    setEditingId(null)
    setSaveError(null)
  }

  function startEdit(event: CalendarEvent) {
    setEditingId(event.id)
    setForm({ title: event.title, notes: event.notes ?? '' })
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
  }

  function insertMention(username: string) {
    setForm((f) => ({
      ...f,
      notes: f.notes ? `${f.notes.replace(/\s+$/, '')} @${username} ` : `@${username} `,
    }))
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setSaveError('Give the entry a title.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { event_date: selectedDate, title: form.title, notes: form.notes || null }
      if (editingId) {
        await updateCalendarEvent(editingId, payload)
      } else {
        await createCalendarEvent(payload)
      }
      setForm(EMPTY_FORM)
      setEditingId(null)
      refetch()
    } catch (err) {
      setSaveError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCalendarEvent(deleteTarget.id)
      setDeleteTarget(null)
      if (editingId === deleteTarget.id) cancelEdit()
      refetch()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const weeks = getMonthGrid(viewYear, viewMonth)
  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    ;(acc[e.event_date] ??= []).push(e)
    return acc
  }, {})
  const selectedDayEvents = eventsByDate[selectedDate] ?? []

  return (
    <>
      <Modal open={open} title="Calendar" onClose={onClose} wide>
        {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              aria-label="Previous month"
              className="rounded-lg border border-white/10 p-1.5 text-white/50 transition-colors hover:border-white/20 hover:text-white"
            >
              ‹
            </button>
            <p className="w-40 text-center font-display text-base font-medium text-white">
              {MONTH_LABELS[viewMonth - 1]} {viewYear}
            </p>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              aria-label="Next month"
              className="rounded-lg border border-white/10 p-1.5 text-white/50 transition-colors hover:border-white/20 hover:text-white"
            >
              ›
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={goToday} className="text-xs font-medium text-gold-300 hover:text-gold-200">
              Today
            </button>
            <button
              type="button"
              onClick={() => downloadCalendarIcs(viewYear, viewMonth)}
              className="text-xs font-medium text-gold-300 hover:text-gold-200"
            >
              Export .ics
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium tracking-wide text-white/40 uppercase">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {loading
            ? Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-lg bg-white/[0.03]" />
              ))
            : weeks.flatMap((week, wi) =>
                week.map((date, di) => {
                  if (!date) return <div key={`${wi}-${di}`} />
                  const iso = toISODate(date)
                  const dayEvents = eventsByDate[iso] ?? []
                  const past = isPastDate(iso)
                  const todayFlag = isToday(iso)
                  const selected = iso === selectedDate

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => selectDay(iso)}
                      className={cn(
                        'flex min-h-[68px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors',
                        past
                          ? 'border-white/5 bg-white/[0.015] opacity-50'
                          : 'border-white/10 bg-white/[0.03] hover:border-gold-400/30',
                        selected && 'border-gold-400/60 bg-gold-500/10',
                        todayFlag && !selected && 'ring-1 ring-gold-400/40',
                      )}
                    >
                      <span className={cn('text-xs font-medium', past ? 'text-white/25' : 'text-white/70')}>
                        {date.getDate()}
                      </span>
                      <div className="flex w-full flex-col gap-0.5">
                        {dayEvents.slice(0, 2).map((e) => (
                          <span
                            key={e.id}
                            className={cn(
                              'truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                              isPastDate(e.event_date)
                                ? 'bg-red-500/15 text-red-300'
                                : 'bg-gold-500/10 text-gold-200',
                            )}
                          >
                            {e.title}
                          </span>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[10px] text-white/30">+{dayEvents.length - 2} more</span>
                        )}
                      </div>
                    </button>
                  )
                }),
              )}
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="mb-3 font-display text-sm font-medium text-white">
            {selectedDate}
            {isToday(selectedDate) && <span className="ml-2 text-xs font-normal text-gold-300">(Today)</span>}
          </p>

          {selectedDayEvents.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {selectedDayEvents.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    'rounded-lg border p-3',
                    isPastDate(e.event_date) ? 'border-red-500/20 bg-red-500/[0.04]' : 'border-white/10 bg-white/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className={cn('text-sm font-medium', isPastDate(e.event_date) ? 'text-red-300' : 'text-white')}>
                      {e.title}
                    </p>
                    {e.is_own && (
                      <div className="flex shrink-0 gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(e)}
                          className="text-xs font-medium text-gold-300 hover:text-gold-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(e)}
                          className="text-xs font-medium text-red-300 hover:text-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {e.notes && <p className="mt-1 text-xs text-white/50">{e.notes}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {!e.is_own && <span className="text-[11px] text-white/30">shared by {e.created_by_name}</span>}
                    {e.all_users ? (
                      <Badge tone="gold" className="text-[10px]">
                        Everyone
                      </Badge>
                    ) : (
                      e.mentioned_usernames.map((u) => (
                        <Badge key={u} tone="neutral" className="text-[10px]">
                          {`@${u}`}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="glass-inset rounded-xl p-4">
            <p className="mb-3 text-xs font-medium tracking-wide text-white/50 uppercase">
              {editingId ? 'Edit entry' : 'New entry'}
            </p>
            <div className="flex flex-col gap-3">
              <TextField
                label="Title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Supplier call"
              />
              <TextareaField
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional details. Tag @username or @all to share this on their calendar too."
                rows={2}
              />
              {mentionableUsers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-white/30">Share with:</span>
                  <button
                    type="button"
                    onClick={() => insertMention('all')}
                    className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2 py-0.5 text-[11px] text-gold-200 transition-colors hover:bg-gold-500/20"
                  >
                    @all
                  </button>
                  {mentionableUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u.username)}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60 transition-colors hover:border-white/20 hover:text-white"
                    >
                      @{u.username}
                    </button>
                  ))}
                </div>
              )}

              {saveError && <p className="text-xs text-red-300">{saveError}</p>}

              <div className="flex items-center gap-3">
                <Button size="sm" isLoading={saving} onClick={handleSave}>
                  {editingId ? 'Save changes' : 'Add entry'}
                </Button>
                {editingId && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-xs font-medium text-white/50 hover:text-white"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete calendar entry"
        message={`Delete "${deleteTarget?.title}"? This can't be undone.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
