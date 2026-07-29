import { API_BASE_URL } from '@/config/api'
import type { Feasibility, FeasibilityPayload } from '@/types/feasibility'
import { getAuthHeaders } from '@/lib/auth'

const BASE_URL = `${API_BASE_URL}/api/feasibility`

export async function listFeasibilities(params: {
  page?: number
  page_size?: number
  search?: string
  status?: string
  customer_id?: number
  sort?: string
}) {
  const query = new URLSearchParams()
  if (params.page) query.append('page', params.page.toString())
  if (params.page_size) query.append('page_size', params.page_size.toString())
  if (params.search) query.append('search', params.search)
  if (params.status) query.append('status', params.status)
  if (params.customer_id) query.append('customer_id', params.customer_id.toString())
  if (params.sort) query.append('sort', params.sort)

  const response = await fetch(`${BASE_URL}?${query}`, {
    headers: await getAuthHeaders(),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function listAvailableForQuotation(params?: { customer_id?: number }) {
  const query = new URLSearchParams()
  if (params?.customer_id) query.append('customer_id', params.customer_id.toString())

  const response = await fetch(`${BASE_URL}/available/for-quotation${query.toString() ? '?' + query : ''}`, {
    headers: await getAuthHeaders(),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Feasibility[]>
}

export async function getFeasibility(id: number) {
  const response = await fetch(`${BASE_URL}/${id}`, {
    headers: await getAuthHeaders(),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Feasibility>
}

export async function createFeasibility(payload: FeasibilityPayload) {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Feasibility>
}

export async function runFeasibilityCheck(id: number) {
  const response = await fetch(`${BASE_URL}/${id}/run`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Feasibility>
}

export async function closeFeasibility(id: number, reason: string) {
  const response = await fetch(`${BASE_URL}/${id}/close`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Feasibility>
}

export async function decideFeasibilityException(id: number, approve: boolean, reason: string) {
  const response = await fetch(`${BASE_URL}/${id}/exception`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ approve, reason }),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Feasibility>
}

export async function deleteFeasibility(id: number) {
  const response = await fetch(`${BASE_URL}/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function restoreFeasibility(id: number) {
  const response = await fetch(`${BASE_URL}/${id}/restore`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Feasibility>
}
