import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/order.py.
export const orderLineSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
})

export const orderSchema = z.object({
  customer_id: z.coerce.number().int().positive('Choose a customer'),
  order_date: z.string().min(1, 'Date is required').refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  requested_delivery_date: z.string().optional().or(z.literal('')).refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  notes: z.string().trim().optional().or(z.literal('')),
  tax_rate: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
  lines: z.array(orderLineSchema).min(1, 'At least one line item is required'),
})

export type OrderFormValues = z.input<typeof orderSchema>
export type OrderSubmitValues = z.output<typeof orderSchema>

export const orderStatusSchema = z.object({
  status: z.enum(['confirmed', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled']),
})

export type OrderStatusFormValues = z.infer<typeof orderStatusSchema>
