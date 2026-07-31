import { apiClient } from './client'

export interface HistoryEntry {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by: number | null
  changed_by_name: string | null
  changed_at: string
}

/** Works against any module's /{id}/history endpoint -- every module
 * (feasibility, quotations, orders, production, delivery notes,
 * purchase orders, and every generic-CRUD master-data resource) exposes
 * the same shape, so one function covers all of them. */
export async function getHistory(resourcePath: string, id: number): Promise<HistoryEntry[]> {
  const { data } = await apiClient.get<HistoryEntry[]>(`${resourcePath}/${id}/history`)
  return data
}

/** For endpoints whose history route isn't a plain /{id}/history suffix
 * (e.g. BOM history lives at /api/products/{id}/bom/history). Pass the
 * full path. */
export async function getHistoryAtUrl(url: string): Promise<HistoryEntry[]> {
  const { data } = await apiClient.get<HistoryEntry[]>(url)
  return data
}
