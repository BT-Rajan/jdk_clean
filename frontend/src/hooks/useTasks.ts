import { useState, useEffect } from 'react'

export interface Task {
  id: string
  title: string
  description?: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in-progress' | 'completed'
  dueDate: string
  assignedTo?: string
  module: 'sales' | 'purchasing' | 'inventory' | 'production' | 'admin'
  createdAt: string
}

const TASKS_KEY = 'jdk_tasks'

// Mock tasks data
const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Follow up with ABC Corp',
    description: 'Check on quotation status',
    priority: 'high',
    status: 'pending',
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    module: 'sales',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Review PO from XYZ Ltd',
    description: 'Quality inspection needed',
    priority: 'medium',
    status: 'in-progress',
    dueDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
    module: 'purchasing',
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    title: 'Stock adjustment for Warehouse A',
    description: 'Update inventory counts',
    priority: 'medium',
    status: 'pending',
    dueDate: new Date(Date.now() + 259200000).toISOString().split('T')[0],
    module: 'inventory',
    createdAt: new Date().toISOString(),
  },
  {
    id: '4',
    title: 'Complete Order #2024-001',
    description: 'Finish production batch',
    priority: 'high',
    status: 'in-progress',
    dueDate: new Date(Date.now() + 3600000).toISOString().split('T')[0],
    module: 'production',
    createdAt: new Date().toISOString(),
  },
]

export function useTasks(userRole?: string) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load tasks from localStorage or use mock data
    const savedTasks = localStorage.getItem(TASKS_KEY)
    if (savedTasks) {
      try {
        setTasks(JSON.parse(savedTasks))
      } catch (e) {
        console.error('Failed to parse tasks:', e)
        setTasks(mockTasks)
        localStorage.setItem(TASKS_KEY, JSON.stringify(mockTasks))
      }
    } else {
      setTasks(mockTasks)
      localStorage.setItem(TASKS_KEY, JSON.stringify(mockTasks))
    }
    setIsLoading(false)
  }, [])

  const addTask = (task: Omit<Task, 'id' | 'createdAt'>) => {
    const newTask: Task = {
      ...task,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    }
    const updatedTasks = [...tasks, newTask]
    setTasks(updatedTasks)
    localStorage.setItem(TASKS_KEY, JSON.stringify(updatedTasks))
    return newTask
  }

  const updateTask = (id: string, updates: Partial<Task>) => {
    const updatedTasks = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
    setTasks(updatedTasks)
    localStorage.setItem(TASKS_KEY, JSON.stringify(updatedTasks))
  }

  const deleteTask = (id: string) => {
    const updatedTasks = tasks.filter((t) => t.id !== id)
    setTasks(updatedTasks)
    localStorage.setItem(TASKS_KEY, JSON.stringify(updatedTasks))
  }

  const getPendingTasks = () => {
    return tasks.filter((t) => t.status !== 'completed')
  }

  const getTasksByModule = (module: string) => {
    return tasks.filter((t) => t.module === module)
  }

  const getTaskCount = () => {
    return getPendingTasks().length
  }

  return {
    tasks,
    isLoading,
    addTask,
    updateTask,
    deleteTask,
    getPendingTasks,
    getTasksByModule,
    getTaskCount,
  }
}
