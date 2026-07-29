interface DashboardItem {
  label: string
  path: string
  description?: string
}

interface DashboardSection {
  id: string
  title: string
  items: DashboardItem[]
}

interface DashboardConfig {
  sections: DashboardSection[]
}

// Default dashboard for all users
const defaultDashboard: DashboardConfig = {
  sections: [
    {
      id: 'quick-access',
      title: 'Quick Access',
      items: [
        { label: 'Customers', path: '/customers', description: 'Manage customer information' },
        { label: 'Suppliers', path: '/suppliers', description: 'Manage supplier details' },
        { label: 'Products', path: '/products', description: 'View and manage products' },
      ],
    },
  ],
}

// Sales role dashboard
const salesDashboard: DashboardConfig = {
  sections: [
    {
      id: 'sales-operations',
      title: 'Sales Operations',
      items: [
        { label: 'Customers', path: '/customers', description: 'View and manage customers' },
        { label: 'Quotations', path: '/quotations', description: 'Create and track quotations' },
        { label: 'Orders', path: '/orders', description: 'Manage sales orders' },
        { label: 'Delivery Notes', path: '/delivery-notes', description: 'Track deliveries' },
      ],
    },
    {
      id: 'sales-insights',
      title: 'Insights',
      items: [
        { label: 'Products', path: '/products', description: 'Product catalog' },
        { label: 'Inventory', path: '/inventory', description: 'Stock availability' },
      ],
    },
  ],
}

// Purchasing role dashboard
const purchasingDashboard: DashboardConfig = {
  sections: [
    {
      id: 'procurement',
      title: 'Procurement',
      items: [
        { label: 'Suppliers', path: '/suppliers', description: 'Supplier management' },
        { label: 'Purchase Orders', path: '/purchase-orders', description: 'Create and track POs' },
        { label: 'Raw Materials', path: '/raw-materials', description: 'Raw material catalog' },
      ],
    },
    {
      id: 'inventory-overview',
      title: 'Inventory Overview',
      items: [
        { label: 'Stock Levels', path: '/inventory', description: 'Current inventory status' },
        { label: 'Products', path: '/products', description: 'Product information' },
      ],
    },
  ],
}

// Inventory role dashboard
const inventoryDashboard: DashboardConfig = {
  sections: [
    {
      id: 'warehouse',
      title: 'Warehouse Management',
      items: [
        { label: 'Stock Levels', path: '/inventory', description: 'Real-time inventory tracking' },
        { label: 'Raw Materials', path: '/raw-materials', description: 'Raw material inventory' },
        { label: 'Products', path: '/products', description: 'Product stock levels' },
      ],
    },
    {
      id: 'movements',
      title: 'Stock Movements',
      items: [
        { label: 'Purchase Orders', path: '/purchase-orders', description: 'Incoming stock' },
        { label: 'Orders', path: '/orders', description: 'Outgoing stock' },
        { label: 'Production', path: '/production', description: 'Production consumption' },
      ],
    },
  ],
}

// Production role dashboard
const productionDashboard: DashboardConfig = {
  sections: [
    {
      id: 'production-management',
      title: 'Production Management',
      items: [
        { label: 'Production', path: '/production', description: 'Production schedules' },
        { label: 'MRP', path: '/mrp', description: 'Material requirements planning' },
        { label: 'Raw Materials', path: '/raw-materials', description: 'Material availability' },
      ],
    },
    {
      id: 'output',
      title: 'Output & Orders',
      items: [
        { label: 'Products', path: '/products', description: 'Produced items' },
        { label: 'Orders', path: '/orders', description: 'Fulfillment orders' },
        { label: 'Inventory', path: '/inventory', description: 'Stock levels' },
      ],
    },
  ],
}

// Admin role dashboard
const adminDashboard: DashboardConfig = {
  sections: [
    {
      id: 'system-overview',
      title: 'System Overview',
      items: [
        { label: 'Users', path: '/users', description: 'User management' },
        { label: 'Settings', path: '/settings', description: 'System configuration' },
      ],
    },
    {
      id: 'all-modules',
      title: 'All Modules',
      items: [
        { label: 'Customers', path: '/customers', description: 'Customer management' },
        { label: 'Suppliers', path: '/suppliers', description: 'Supplier management' },
        { label: 'Orders', path: '/orders', description: 'Sales orders' },
        { label: 'Quotations', path: '/quotations', description: 'Customer quotations' },
        { label: 'Purchase Orders', path: '/purchase-orders', description: 'Vendor orders' },
        { label: 'Products', path: '/products', description: 'Product catalog' },
        { label: 'Raw Materials', path: '/raw-materials', description: 'Raw materials' },
        { label: 'Inventory', path: '/inventory', description: 'Stock management' },
        { label: 'Production', path: '/production', description: 'Production management' },
        { label: 'MRP', path: '/mrp', description: 'Material planning' },
        { label: 'Delivery Notes', path: '/delivery-notes', description: 'Delivery tracking' },
      ],
    },
  ],
}

export function getDashboardConfig(role?: string): DashboardConfig {
  switch (role?.toLowerCase()) {
    case 'sales':
      return salesDashboard
    case 'purchasing':
    case 'procurement':
      return purchasingDashboard
    case 'inventory':
    case 'warehouse':
      return inventoryDashboard
    case 'production':
    case 'manufacturing':
      return productionDashboard
    case 'admin':
    case 'administrator':
      return adminDashboard
    default:
      return defaultDashboard
  }
}
