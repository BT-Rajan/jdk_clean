import { z } from 'zod'

// Mirrors backend/app/schemas/machine.py.
export const machineSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(150),
  capacity_hours_per_day: z.coerce.number().positive('Must be greater than 0'),
  status: z.enum(['active', 'inactive']),
})

export type MachineFormValues = z.input<typeof machineSchema>
export type MachineSubmitValues = z.output<typeof machineSchema>

// MachineOut round-trips every Update field, so the edit form only drops
// the immutable `code`.
export const machineEditSchema = machineSchema.omit({ code: true })

export type MachineEditFormValues = z.input<typeof machineEditSchema>
export type MachineEditSubmitValues = z.output<typeof machineEditSchema>
