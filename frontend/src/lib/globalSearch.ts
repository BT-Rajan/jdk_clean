import { listCustomers } from '@/api/customers'
import { listSuppliers } from '@/api/suppliers'
import { listQuotations } from '@/api/quotations'
import { listOrders } from '@/api/orders'
import { listPurchaseOrders } from '@/api/purchaseOrders'
import { listSupplierReturns } from '@/api/supplierReturns'
import { listDeliveryNotes } from '@/api/deliveryNotes'
import { listProducts } from '@/api/products'
import { listRawMaterials } from '@/api/rawMaterials'

export interface GlobalSearchResult {
  id: string
  group: string
  label: string
  sublabel?: string
  path: string
}

const PAGE_SIZE = 4

/**
 * Fans out to every list endpoint the app already has (each already
 * supports `search=`), in parallel, and flattens the top few matches
 * from each into one list. Uses allSettled -- a page a staff/viewer
 * user has no access to (403) just contributes nothing, silently,
 * rather than failing the whole search. This is what lets the
 * assistant's message box double as an app-wide search bar instead of
 * needing a separate one.
 */
export async function runGlobalSearch(query: string): Promise<GlobalSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const params = { search: q, page: 1, page_size: PAGE_SIZE }

  const [customers, suppliers, quotations, orders, purchaseOrders, supplierReturns, deliveryNotes, products, rawMaterials] =
    await Promise.allSettled([
      listCustomers(params),
      listSuppliers(params),
      listQuotations(params),
      listOrders(params),
      listPurchaseOrders(params),
      listSupplierReturns(params),
      listDeliveryNotes(params),
      listProducts(params),
      listRawMaterials(params),
    ])

  const results: GlobalSearchResult[] = []

  if (customers.status === 'fulfilled') {
    for (const c of customers.value.items) {
      results.push({ id: `customer-${c.id}`, group: 'Customers', label: c.name, sublabel: c.code, path: `/customers/${c.id}` })
    }
  }
  if (suppliers.status === 'fulfilled') {
    for (const s of suppliers.value.items) {
      results.push({ id: `supplier-${s.id}`, group: 'Suppliers', label: s.name, sublabel: s.code, path: `/suppliers/${s.id}` })
    }
  }
  if (quotations.status === 'fulfilled') {
    for (const qt of quotations.value.items) {
      results.push({
        id: `quotation-${qt.id}`,
        group: 'Quotations',
        label: qt.quotation_number,
        sublabel: qt.customer_name ?? undefined,
        path: `/quotations/${qt.id}`,
      })
    }
  }
  if (orders.status === 'fulfilled') {
    for (const o of orders.value.items) {
      results.push({
        id: `order-${o.id}`,
        group: 'Orders',
        label: o.order_number,
        sublabel: o.customer_name ?? undefined,
        path: `/orders/${o.id}`,
      })
    }
  }
  if (purchaseOrders.status === 'fulfilled') {
    for (const po of purchaseOrders.value.items) {
      results.push({
        id: `po-${po.id}`,
        group: 'Purchase orders',
        label: po.po_number,
        sublabel: po.supplier_name ?? undefined,
        path: `/purchase-orders/${po.id}`,
      })
    }
  }
  if (supplierReturns.status === 'fulfilled') {
    for (const sr of supplierReturns.value.items) {
      results.push({
        id: `sr-${sr.id}`,
        group: 'Supplier returns',
        label: sr.return_number,
        sublabel: sr.supplier_name ?? undefined,
        path: `/supplier-returns/${sr.id}`,
      })
    }
  }
  if (deliveryNotes.status === 'fulfilled') {
    for (const dn of deliveryNotes.value.items) {
      results.push({
        id: `dn-${dn.id}`,
        group: 'Delivery notes',
        label: dn.delivery_note_number,
        sublabel: dn.customer_name ?? undefined,
        path: `/delivery-notes/${dn.id}`,
      })
    }
  }
  if (products.status === 'fulfilled') {
    for (const p of products.value.items) {
      results.push({ id: `product-${p.id}`, group: 'Products', label: p.name, path: `/products/${p.id}` })
    }
  }
  if (rawMaterials.status === 'fulfilled') {
    for (const rm of rawMaterials.value.items) {
      results.push({ id: `rm-${rm.id}`, group: 'Raw materials', label: rm.name, path: `/raw-materials/${rm.id}` })
    }
  }

  return results
}
