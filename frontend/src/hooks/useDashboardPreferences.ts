import { useState, useEffect } from 'react'

export interface DashboardWidget {
  id: string
  title: string
  type: 'stats' | 'graph'
  dataSource: string
  enabled: boolean
}

export interface DashboardPreferences {
  widgets: DashboardWidget[]
}

const DASHBOARD_PREFS_KEY = 'jdk_dashboard_prefs'

// Available widgets by role
const availableWidgetsByRole: Record<string, DashboardWidget[]> = {
  sales: [
    { id: 'sales-customers', title: 'Customers (This Month)', type: 'stats', dataSource: 'customers_month', enabled: true },
    { id: 'sales-quotations', title: 'Quotations (This Month)', type: 'stats', dataSource: 'quotations_month', enabled: true },
    { id: 'sales-orders', title: 'Orders (This Month)', type: 'stats', dataSource: 'orders_month', enabled: true },
    { id: 'sales-trend', title: 'Sales Trend', type: 'graph', dataSource: 'sales_trend', enabled: true },
    { id: 'customers-graph', title: 'Top Customers', type: 'graph', dataSource: 'top_customers', enabled: false },
  ],
  purchasing: [
    { id: 'po-total', title: 'Total POs', type: 'stats', dataSource: 'purchase_orders', enabled: true },
    { id: 'po-pending', title: 'Pending POs', type: 'stats', dataSource: 'purchase_orders_pending', enabled: true },
    { id: 'suppliers-count', title: 'Active Suppliers', type: 'stats', dataSource: 'suppliers_count', enabled: true },
    { id: 'po-trend', title: 'PO Trend', type: 'graph', dataSource: 'po_trend', enabled: true },
    { id: 'suppliers-graph', title: 'Supplier Performance', type: 'graph', dataSource: 'supplier_performance', enabled: false },
  ],
  inventory: [
    { id: 'stock-items', title: 'Total Stock Items', type: 'stats', dataSource: 'inventory_items', enabled: true },
    { id: 'stock-value', title: 'Inventory Value', type: 'stats', dataSource: 'inventory_value', enabled: true },
    { id: 'low-stock', title: 'Low Stock Items', type: 'stats', dataSource: 'low_stock_count', enabled: true },
    { id: 'stock-movement', title: 'Stock Movement', type: 'graph', dataSource: 'stock_movement', enabled: true },
    { id: 'inventory-breakdown', title: 'Inventory Breakdown', type: 'graph', dataSource: 'inventory_breakdown', enabled: false },
  ],
  production: [
    { id: 'production-orders', title: 'Active Productions', type: 'stats', dataSource: 'production_active', enabled: true },
    { id: 'production-completion', title: 'Completion Rate', type: 'stats', dataSource: 'production_completion', enabled: true },
    { id: 'production-delayed', title: 'Delayed Orders', type: 'stats', dataSource: 'production_delayed', enabled: true },
    { id: 'production-trend', title: 'Production Timeline', type: 'graph', dataSource: 'production_timeline', enabled: true },
    { id: 'mrp-graph', title: 'Material Requirements', type: 'graph', dataSource: 'mrp_status', enabled: false },
  ],
  admin: [
    { id: 'admin-quotations', title: 'Quotations (This Month)', type: 'stats', dataSource: 'quotations_month', enabled: true },
    { id: 'admin-orders', title: 'Orders (This Month)', type: 'stats', dataSource: 'orders_month', enabled: true },
    { id: 'admin-raw-materials', title: 'Raw Materials in Stock', type: 'stats', dataSource: 'raw_materials_count', enabled: true },
    { id: 'admin-inventory', title: 'Inventory Value', type: 'stats', dataSource: 'inventory_value', enabled: true },
    { id: 'admin-open-deals', title: 'Open Deals', type: 'stats', dataSource: 'open_deals', enabled: true },
    { id: 'admin-cancelled-deals', title: 'Cancelled Deals', type: 'stats', dataSource: 'cancelled_deals', enabled: false },
    { id: 'admin-auto-created', title: 'Auto-Created This Month', type: 'stats', dataSource: 'auto_created_this_month', enabled: true },
    { id: 'admin-bom-missing', title: 'Checks Blocked on Missing BOM', type: 'stats', dataSource: 'bom_missing_count', enabled: true },
    { id: 'admin-pending-reviews', title: 'Pending Admin Reviews', type: 'stats', dataSource: 'pending_admin_reviews', enabled: true },
  ],
}

export function useDashboardPreferences(role?: string) {
  const [preferences, setPreferences] = useState<DashboardPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load preferences from localStorage
    const savedPrefs = localStorage.getItem(DASHBOARD_PREFS_KEY)
    if (savedPrefs) {
      try {
        setPreferences(JSON.parse(savedPrefs))
      } catch (e) {
        console.error('Failed to parse dashboard preferences:', e)
        initializePreferences()
      }
    } else {
      initializePreferences()
    }
    setIsLoading(false)
  }, [])

  const initializePreferences = () => {
    const roleKey = (role || 'admin').toLowerCase()
    const widgets = availableWidgetsByRole[roleKey] || availableWidgetsByRole.admin
    const prefs: DashboardPreferences = { widgets }
    setPreferences(prefs)
    localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs))
  }

  const updateWidgetEnabled = (widgetId: string, enabled: boolean) => {
    if (!preferences) return

    const updatedPrefs: DashboardPreferences = {
      ...preferences,
      widgets: preferences.widgets.map((w) =>
        w.id === widgetId ? { ...w, enabled } : w
      ),
    }
    setPreferences(updatedPrefs)
    localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(updatedPrefs))
  }

  const getAvailableWidgets = (roleOverride?: string) => {
    const roleKey = (roleOverride || role || 'admin').toLowerCase()
    return availableWidgetsByRole[roleKey] || availableWidgetsByRole.admin
  }

  const getEnabledWidgets = () => {
    return preferences?.widgets.filter((w) => w.enabled) || []
  }

  return {
    preferences,
    isLoading,
    updateWidgetEnabled,
    getAvailableWidgets,
    getEnabledWidgets,
    initializePreferences,
  }
}
