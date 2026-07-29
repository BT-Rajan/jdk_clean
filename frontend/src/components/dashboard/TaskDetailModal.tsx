import { useState } from 'react'
import { Modal, Button, TextField, SelectField } from '@/components/ui'
import type { Task, TaskRecurrence } from '@/hooks/useTasks'

interface TaskDetailModalProps {
  task: Task | null
  onClose: () => void
  onCloseTask: (id: string) => void
  onDefer: (id: string, newDueDate: string) => void
  onAssign: (id: string, assignedTo: string) => void
  onSetRecurrence: (id: string, recurrence: TaskRecurrence | undefined) => void
}

type ActionPanel = 'defer' | 'assign' | 'recur' | null

const moduleLabel: Record<Task['module'], string> = {
  sales: 'Sales',
  purchasing: 'Purchasing',
  inventory: 'Inventory',
  production: 'Production',
  admin: 'Admin',
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

const frequencyLabel: Record<TaskRecurrence['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export function TaskDetailModal({ task, onClose, onCloseTask, onDefer, onAssign, onSetRecurrence }: TaskDetailModalProps) {
  const [panel, setPanel] = useState<ActionPanel>(null)
  const [deferDate, setDeferDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [recurDate, setRecurDate] = useState('')
  const [recurTime, setRecurTime] = useState('09:00')
  const [recurFrequency, setRecurFrequency] = useState<TaskRecurrence['frequency']>('weekly')

  if (!task) return null

  const resetPanel = () => {
    setPanel(null)
    setDeferDate('')
    setAssignee('')
    setRecurDate('')
    setRecurTime('09:00')
    setRecurFrequency('weekly')
  }

  const handleClose = () => {
    resetPanel()
    onClose()
  }

  const openPanel = (next: ActionPanel) => {
    if (panel === next) {
      setPanel(null)
      return
    }
    if (next === 'defer') setDeferDate(task.dueDate)
    if (next === 'assign') setAssignee(task.assignedTo ?? '')
    if (next === 'recur' && task.recurrence) {
      setRecurDate(task.recurrence.date)
      setRecurTime(task.recurrence.time)
      setRecurFrequency(task.recurrence.frequency)
    }
    setPanel(next)
  }

  const handleCloseTask = () => {
    onCloseTask(task.id)
    handleClose()
  }

  const handleApplyDefer = () => {
    if (!deferDate) return
    onDefer(task.id, deferDate)
    resetPanel()
  }

  const handleApplyAssign = () => {
    if (!assignee.trim()) return
    onAssign(task.id, assignee.trim())
    resetPanel()
  }

  const handleApplyRecurrence = () => {
    if (!recurDate) return
    onSetRecurrence(task.id, { frequency: recurFrequency, date: recurDate, time: recurTime })
    resetPanel()
  }

  const handleRemoveRecurrence = () => {
    onSetRecurrence(task.id, undefined)
    resetPanel()
  }

  return (
    <Modal open={Boolean(task)} title="Task Details" onClose={handleClose}>
      <div className="space-y-4">
        <div>
          <p className="text-lg font-medium text-white">{task.title}</p>
          {task.description && <p className="mt-1 text-sm text-white/60">{task.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${priorityColor[task.priority]}`}>
            {task.priority} priority
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-white/60">
            {moduleLabel[task.module]}
          </span>
          {task.recurrence && (
            <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2 py-1 text-xs font-medium text-gold-200">
              🔁 {frequencyLabel[task.recurrence.frequency]}
            </span>
          )}
        </div>

        <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Status</p>
            <p className={`mt-1 font-medium ${statusColor[task.status]}`}>{statusLabel[task.status]}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Due Date</p>
            <p className="mt-1 font-medium text-white">{new Date(task.dueDate).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Assigned To</p>
            <p className="mt-1 font-medium text-white">{task.assignedTo || 'Unassigned'}</p>
          </div>
          {task.recurrence && (
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Recurs</p>
              <p className="mt-1 font-medium text-white">
                {frequencyLabel[task.recurrence.frequency]} · {new Date(task.recurrence.date).toLocaleDateString()} at{' '}
                {task.recurrence.time}
              </p>
            </div>
          )}
        </div>

        {task.status !== 'completed' && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={handleCloseTask}>
              Close Task
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openPanel('defer')}>
              Defer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openPanel('assign')}>
              Assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openPanel('recur')}>
              Make Recurring
            </Button>
          </div>
        )}

        {panel === 'defer' && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <TextField
              label="New Due Date"
              type="date"
              value={deferDate}
              onChange={(e) => setDeferDate(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="subtle" onClick={resetPanel}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleApplyDefer} disabled={!deferDate}>
                Apply
              </Button>
            </div>
          </div>
        )}

        {panel === 'assign' && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <TextField
              label="Assign To"
              type="text"
              placeholder="Enter name"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="subtle" onClick={resetPanel}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleApplyAssign} disabled={!assignee.trim()}>
                Apply
              </Button>
            </div>
          </div>
        )}

        {panel === 'recur' && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Date"
                type="date"
                value={recurDate}
                onChange={(e) => setRecurDate(e.target.value)}
              />
              <TextField
                label="Time"
                type="time"
                value={recurTime}
                onChange={(e) => setRecurTime(e.target.value)}
              />
            </div>
            <SelectField
              label="Frequency"
              value={recurFrequency}
              onChange={(e) => setRecurFrequency(e.target.value as TaskRecurrence['frequency'])}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </SelectField>
            <div className="flex justify-end gap-2">
              {task.recurrence && (
                <Button size="sm" variant="danger" onClick={handleRemoveRecurrence}>
                  Remove Recurrence
                </Button>
              )}
              <Button size="sm" variant="subtle" onClick={resetPanel}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleApplyRecurrence} disabled={!recurDate}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
