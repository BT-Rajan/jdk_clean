import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/delivery_note.py DeliveryNoteCreate. Lines
// are intentionally not part of this form -- they're auto-populated from
// the chosen order server-side (see delivery_note_service.py) and can be
// adjusted afterward on the detail page while the note is still draft.
export const deliveryNoteCreateSchema = z.object({
  order_id: z.coerce.number().int().positive('Choose an order'),
  delivery_date: z.string().min(1, 'Date is required').refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  notes: z.string().trim().optional().or(z.literal('')),
})

export type DeliveryNoteCreateFormValues = z.input<typeof deliveryNoteCreateSchema>
export type DeliveryNoteCreateSubmitValues = z.output<typeof deliveryNoteCreateSchema>
