import type { UnitOfMeasure, UnitOfMeasureCreatePayload, UnitOfMeasureUpdatePayload } from '@/types/unitOfMeasure'
import { createResourceApi } from './resource'

const api = createResourceApi<UnitOfMeasure, UnitOfMeasureCreatePayload, UnitOfMeasureUpdatePayload>('/api/units')

export const listUnits = api.list
export const getUnit = api.get
export const createUnit = api.create
export const updateUnit = api.update
export const deleteUnit = api.remove
export const restoreUnit = api.restore
export const activateUnit = api.activate
export const deactivateUnit = api.deactivate
