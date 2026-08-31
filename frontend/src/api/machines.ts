import type { Machine, MachinePayload } from '@/types/machine'
import { createResourceApi } from './resource'

const api = createResourceApi<Machine, MachinePayload, Partial<MachinePayload>>('/api/machines')

export const listMachines = api.list
export const getMachine = api.get
export const createMachine = api.create
export const updateMachine = api.update
export const deleteMachine = api.remove
export const restoreMachine = api.restore
export const activateMachine = api.activate
export const deactivateMachine = api.deactivate
