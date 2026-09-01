import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/order.py.
export const orderLineSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
  discount_percent: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
})

export const orderSchema = z
  .object({
    customer_id: z.coerce.number().int().positive('Choose a customer'),
    order_date: z.string().min(1, 'Date is required').refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
    requested_delivery_date: z.string().optional().or(z.literal('')).refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
    notes: z.string().trim().optional().or(z.literal('')),
    discount_percent: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
    lines: z.array(orderLineSchema).min(1, 'At least one line item is required'),
  })
  .refine((data) => !data.requested_delivery_date || data.requested_delivery_date >= data.order_date, {
    message: "Can't be before the order date.",
    path: ['requested_delivery_date'],
  })

export type OrderFormValues = z.input<typeof orderSchema>
export type OrderSubmitValues = z.output<typeof orderSchema>

export const orderStatusSchema = z.object({
  status: z.enum(['confirmed', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled']),
})

export type OrderStatusFormValues = z.infer<typeof orderStatusSchema>

export const orderAdminReviewSchema = z.object({
  notes: z.string().trim().min(1, 'Notes are required.'),
})
export type OrderAdminReviewFormValues = z.infer<typeof orderAdminReviewSchema>

// Mirrors backend/app/schemas/order.py's OrderQuickLog.
export const orderQuickLogLineSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
})

export const orderQuickLogSchema = z.object({
  customer_id: z.coerce.number().int().positive('Choose a customer'),
  notes: z.string().trim().optional().or(z.literal('')),
  lines: z.array(orderQuickLogLineSchema).min(1, 'At least one line item is required'),
})

export type OrderQuickLogFormValues = z.input<typeof orderQuickLogSchema>
export type OrderQuickLogSubmitValues = z.output<typeof orderQuickLogSchema>
