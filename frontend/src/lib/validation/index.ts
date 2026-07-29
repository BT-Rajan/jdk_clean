/**
 * Barrel export: every page still imports from '@/lib/validation', this
 * directory just splits the schemas out one file per resource -- mirroring
 * backend/app/schemas/<resource>.py -- instead of one growing flat file.
 */
export * from './auth'
export * from './dateRules'
export * from './customer'
export * from './supplier'
export * from './rawMaterial'
export * from './product'
export * from './machine'
export * from './bom'
export * from './quotation'
export * from './feasibility'
export * from './order'
export * from './production'
export * from './purchaseOrder'
export * from './deliveryNote'
export * from './user'
