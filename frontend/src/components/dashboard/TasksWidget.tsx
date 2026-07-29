import { useState } from 'react'
import { GlassCard } from '@/components/ui'
import type { Task, TaskRecurrence } from '@/hooks/useTasks'
import { TaskDetailModal } from './TaskDetailModal'

interface TasksWidgetProps {
  tasks: Task[]
  onCloseTask: (id: string) => void
  onDefer: (id: string, newDueDate: string) => void
  onAssign: (id: string, assignedTo: string) => void
  onSetRecurrence: (id: string, recurrence: TaskRecurrence | undefined) => void
}

export function TasksWidget({ tasks, onCloseTask, onDefer, onAssign, onSetRecurrence }: TasksWidgetProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

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

  // Keep the modal in sync with the latest task data (e.g. after an action is applied)
  const activeTask = selectedTask ? tasks.find((t) => t.id === selectedTask.id) ?? null : null

  if (tasks.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="mb-4 text-sm font-medium text-white">Tasks</h3>
        <p className="text-center text-sm text-white/40">No tasks at the moment</p>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-6">
      <h3 className="mb-4 text-sm font-medium text-white">
        Tasks <span className="text-xs text-white/40">({tasks.length})</span>
      </h3>
      <div className="space-y-3">
        {tasks.slice(0, 5).map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => setSelectedTask(task)}
            className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {task.title} {task.recurrence && <span title="Recurring">🔁</span>}
                </p>
                <p className={`mt-1 text-xs ${getStatusColor(task.status)}`}>
                  {task.status === 'in-progress' ? '🔄 In Progress' : task.status === 'completed' ? '✓ Completed' : '⏳ Pending'}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-medium whitespace-nowrap ${getPriorityColor(task.priority)}`}>
                {task.priority}
              </span>
            </div>
            {task.description && (
              <p className="mt-2 text-xs text-white/40 line-clamp-1">{task.description}</p>
            )}
            <p className="mt-2 text-xs text-white/30">Due: {new Date(task.dueDate).toLocaleDateString()}</p>
          </button>
        ))}
        {tasks.length > 5 && (
          <p className="text-center text-xs text-white/40">+{tasks.length - 5} more tasks</p>
        )}
      </div>

      <TaskDetailModal
        task={activeTask}
        onClose={() => setSelectedTask(null)}
        onCloseTask={onCloseTask}
        onDefer={onDefer}
        onAssign={onAssign}
        onSetRecurrence={onSetRecurrence}
      />
    </GlassCard>
  )
}
