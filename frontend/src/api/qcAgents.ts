import type { QcAgent, QcAgentPayload } from '@/types/qcAgent'
import { createResourceApi } from './resource'

const api = createResourceApi<QcAgent, QcAgentPayload, Partial<QcAgentPayload>>('/api/qc-agents')

export const listQcAgents = api.list
export const getQcAgent = api.get
export const createQcAgent = api.create
export const updateQcAgent = api.update
export const deleteQcAgent = api.remove
export const restoreQcAgent = api.restore
export const activateQcAgent = api.activate
export const deactivateQcAgent = api.deactivate
