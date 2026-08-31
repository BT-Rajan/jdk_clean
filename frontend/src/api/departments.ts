import type { Department, DepartmentCreatePayload, DepartmentUpdatePayload } from '@/types/department'
import { createResourceApi } from './resource'

const api = createResourceApi<Department, DepartmentCreatePayload, DepartmentUpdatePayload>('/api/departments')

export const listDepartments = api.list
export const getDepartment = api.get
export const createDepartment = api.create
export const updateDepartment = api.update
export const deleteDepartment = api.remove
export const restoreDepartment = api.restore
export const activateDepartment = api.activate
export const deactivateDepartment = api.deactivate
