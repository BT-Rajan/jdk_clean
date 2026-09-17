/** Mirrors backend/app/schemas/qc_agent.py. An external testing
 * laboratory/agent -- JDK never performs the actual testing itself. */
import type { ActiveStatus } from './customer'

export interface QcAgent {
  id: number
  code: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  status: ActiveStatus
}

export interface QcAgentPayload {
  code: string
  name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  status?: ActiveStatus
}
