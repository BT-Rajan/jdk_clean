import type { ListQueryParams, MessageResponse, PagedResponse } from '@/types/common'
import { apiClient } from './client'

/**
 * One CRUD client for every master, matching the one CRUD engine every
 * master router is built on (backend/app/api/common.py's build_crud_router
 * + backend/app/crud/base.py's BaseCRUD). Existing per-resource api/*.ts
 * files (api/machines.ts, api/customers.ts, ...) delegate their named
 * exports to an instance of this instead of hand-writing the same six
 * axios calls per module -- see any of them for the pattern. New masters
 * should do the same rather than writing list/get/create/update/delete
 * by hand.
 *
 * activate/deactivate only make sense for masters with a `status` column
 * (every current one does) -- calling them against a resource whose
 * router didn't register those routes (activatable=False) just 404s,
 * same as calling any other route the backend doesn't have.
 */
export interface ResourceApi<T, CreatePayload, UpdatePayload = Partial<CreatePayload>> {
  list(params?: ListQueryParams): Promise<PagedResponse<T>>
  get(id: number): Promise<T>
  create(payload: CreatePayload): Promise<T>
  update(id: number, payload: UpdatePayload): Promise<T>
  remove(id: number): Promise<MessageResponse>
  restore(id: number): Promise<T>
  activate(id: number): Promise<T>
  deactivate(id: number): Promise<T>
  history(id: number): Promise<unknown>
}

export function createResourceApi<T, CreatePayload = Partial<T>, UpdatePayload = Partial<CreatePayload>>(
  basePath: string,
): ResourceApi<T, CreatePayload, UpdatePayload> {
  return {
    async list(params = {}) {
      const { data } = await apiClient.get<PagedResponse<T>>(basePath, { params })
      return data
    },
    async get(id) {
      const { data } = await apiClient.get<T>(`${basePath}/${id}`)
      return data
    },
    async create(payload) {
      const { data } = await apiClient.post<T>(basePath, payload)
      return data
    },
    async update(id, payload) {
      const { data } = await apiClient.put<T>(`${basePath}/${id}`, payload)
      return data
    },
    async remove(id) {
      const { data } = await apiClient.delete<MessageResponse>(`${basePath}/${id}`)
      return data
    },
    async restore(id) {
      const { data } = await apiClient.post<T>(`${basePath}/${id}/restore`)
      return data
    },
    async activate(id) {
      const { data } = await apiClient.post<T>(`${basePath}/${id}/activate`)
      return data
    },
    async deactivate(id) {
      const { data } = await apiClient.post<T>(`${basePath}/${id}/deactivate`)
      return data
    },
    async history(id) {
      const { data } = await apiClient.get(`${basePath}/${id}/history`)
      return data
    },
  }
}
