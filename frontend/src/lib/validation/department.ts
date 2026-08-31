import { z } from 'zod'

// Mirrors backend/app/schemas/department.py.
export const departmentSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(80),
  status: z.enum(['active', 'inactive']),
})

export type DepartmentFormValues = z.infer<typeof departmentSchema>

// code is immutable once created, same convention as every other master.
export const departmentEditSchema = departmentSchema.omit({ code: true })

export type DepartmentEditFormValues = z.infer<typeof departmentEditSchema>
