import { useState } from 'react'
import { Modal } from '@/components/ui'
import type { Task, TaskRecurrence } from '@/hooks/useTasks'
import { TaskDetailModal } from '@/components/dashboard/TaskDetailModal'

interface TasksNotificationModalProps {
  open: boolean
  onClose: () => void
  tasks: Task[]
  onCloseTask: (id: string) => void
  onDefer: (id: string, newDueDate: string) => void
  onAssign: (id: string, assignedTo: string) => void
  onSetRecurrence: (id: string, recurrence: TaskRecurrence | undefined) => void
}

const priorityColor: Record<Task['priority'], string> = {
  high: 'bg-red-500/10 border-red-500/30 text-red-300',
  medium: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
  low: 'bg-green-500/10 border-green-500/30 text-green-300',
}

const statusColor: Record<Task['status'], string> = {
  completed: 'text-green-400',
  'in-progress': 'text-blue-400',
  pending: 'text-white/60',
}

const statusLabel: Record<Task['status'], string> = {
  completed: '✓ Completed',
  'in-progress': '🔄 In Progress',
  pending: '⏳ Pending',
}

const moduleColor: Record<Task['module'], string> = {
  sales: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  purchasing: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  inventory: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  production: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
  admin: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
}

// Same task-interaction standard as TasksWidget on the dashboard: tasks
// are clickable and open the shared TaskDetailModal with the full
// close/defer/assign/recur action set, not a read-only list. Also uses
// the shared Modal component (like every other modal in the app) instead
// of hand-rolled overlay markup.
export function TasksNotificationModal({
  open,
  onClose,
  tasks,
  onCloseTask,
  onDefer,
  onAssign,
  onSetRecurrence,
}: TasksNotificationModalProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // Keep the detail modal in sync with the latest task data (e.g. after an action is applied).
  const activeTask = selectedTask ? tasks.find((t) => t.id === selectedTask.id) ?? null : null

  function handleClose() {
    setSelectedTask(null)
    onClose()
  }

  return (
    <>
      <Modal open={open} title={`Tasks (${tasks.length})`} onClose={handleClose}>
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">No pending tasks</p>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTask(task)}
                className="w-full rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <p className="font-medium text-white">
                  {task.title} {task.recurrence && <span title="Recurring">🔁</span>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${priorityColor[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${moduleColor[task.module]}`}>
                    {task.module}
                  </span>
                </div>
                {task.description && <p className="mt-2 text-sm text-white/60 line-clamp-1">{task.description}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <p className={`text-xs ${statusColor[task.status]}`}>{statusLabel[task.status]}</p>
                  <p className="text-xs text-white/40">Due: {new Date(task.dueDate).toLocaleDateString()}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </Modal>

      <TaskDetailModal
        task={activeTask}
        onClose={() => setSelectedTask(null)}
        onCloseTask={onCloseTask}
        onDefer={onDefer}
        onAssign={onAssign}
        onSetRecurrence={onSetRecurrence}
      />
    </>
  )
}
