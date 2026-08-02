import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/ui'
import type { Notification, NotificationSeverity } from '@/types/notification'
import { formatDateTime } from '@/lib/dateFormat'

interface NotificationsModalProps {
  open: boolean
  onClose: () => void
  notifications: Notification[]
  loading: boolean
  error: string | null
}

const severityColor: Record<NotificationSeverity, string> = {
  high: 'bg-red-500/10 border-red-500/30 text-red-300',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  low: 'bg-white/5 border-white/10 text-white/50',
}

const severityLabel: Record<NotificationSeverity, string> = {
  high: 'Needs attention',
  medium: 'Follow up',
  low: 'FYI',
}

// Every item here is a live record pulled from the database (see
// GET /api/notifications -> notification_service.py) -- an admin-review
// flag, a pending exception decision, a low-stock material, a delayed
// batch. Clicking one navigates straight to that record; there's no
// separate to-do list to manage on top of it.
export function NotificationsModal({ open, onClose, notifications, loading, error }: NotificationsModalProps) {
  const navigate = useNavigate()

  function handleSelect(n: Notification) {
    onClose()
    navigate(n.link)
  }

  return (
    <Modal open={open} title={`Notifications (${notifications.length})`} onClose={onClose} wide>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto">
        {loading ? (
          <p className="py-6 text-center text-sm text-white/40">Loading…</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-300">{error}</p>
        ) : notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">Nothing needs your attention right now.</p>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleSelect(n)}
              className="w-full rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-white">{n.title}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${severityColor[n.severity]}`}>
                  {severityLabel[n.severity]}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/60">{n.message}</p>
              <p className="mt-2 text-xs text-white/30">{formatDateTime(n.created_at)}</p>
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
