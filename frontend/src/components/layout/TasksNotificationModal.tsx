import type { Task } from '@/hooks/useTasks'

interface TasksNotificationModalProps {
  open: boolean
  onClose: () => void
  tasks: Task[]
}

export function TasksNotificationModal({ open, onClose, tasks }: TasksNotificationModalProps) {
  if (!open) return null

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/10 border-red-500/30 text-red-300'
      case 'medium':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
      case 'low':
        return 'bg-green-500/10 border-green-500/30 text-green-300'
    }
  }

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-400'
      case 'in-progress':
        return 'text-blue-400'
      case 'pending':
        return 'text-white/60'
    }
  }

  const moduleColor: Record<string, string> = {
    sales: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    purchasing: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    inventory: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    production: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
    admin: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md transform rounded-2xl border border-gold-400/20 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl transition-all">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Tasks <span className="text-gold-300">({tasks.length})</span>
            </h2>
            <button
              onClick={onClose}
              className="text-white/40 transition-colors hover:text-white/60"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-6 max-h-96 space-y-3 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-center text-sm text-white/40">No pending tasks</p>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white">{task.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${moduleColor[task.module]}`}>
                          {task.module}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-2 text-sm text-white/60">{task.description}</p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <p className={`text-xs ${getStatusColor(task.status)}`}>
                          {task.status === 'in-progress' ? '🔄 In Progress' : task.status === 'completed' ? '✓ Completed' : '⏳ Pending'}
                        </p>
                        <p className="text-xs text-white/40">
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-gold-400/30 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-200 transition-colors hover:bg-gold-500/20"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
