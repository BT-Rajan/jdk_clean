import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthProvider'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute'
import { LoginPage } from '@/pages/LoginPage'
import { FullScreenLoader } from '@/components/layout/FullScreenLoader'

const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

const CustomersListPage = lazy(() =>
  import('@/pages/customers/CustomersListPage').then((m) => ({ default: m.CustomersListPage })),
)
const CustomerFormPage = lazy(() =>
  import('@/pages/customers/CustomerFormPage').then((m) => ({ default: m.CustomerFormPage })),
)
const CustomerDetailPage = lazy(() =>
  import('@/pages/customers/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })),
)

const SuppliersListPage = lazy(() =>
  import('@/pages/suppliers/SuppliersListPage').then((m) => ({ default: m.SuppliersListPage })),
)
const SupplierFormPage = lazy(() =>
  import('@/pages/suppliers/SupplierFormPage').then((m) => ({ default: m.SupplierFormPage })),
)
const SupplierDetailPage = lazy(() =>
  import('@/pages/suppliers/SupplierDetailPage').then((m) => ({ default: m.SupplierDetailPage })),
)

const RawMaterialsListPage = lazy(() =>
  import('@/pages/rawMaterials/RawMaterialsListPage').then((m) => ({ default: m.RawMaterialsListPage })),
)
const RawMaterialFormPage = lazy(() =>
  import('@/pages/rawMaterials/RawMaterialFormPage').then((m) => ({ default: m.RawMaterialFormPage })),
)
const RawMaterialDetailPage = lazy(() =>
  import('@/pages/rawMaterials/RawMaterialDetailPage').then((m) => ({ default: m.RawMaterialDetailPage })),
)

const ProductsListPage = lazy(() =>
  import('@/pages/products/ProductsListPage').then((m) => ({ default: m.ProductsListPage })),
)
const ProductFormPage = lazy(() =>
  import('@/pages/products/ProductFormPage').then((m) => ({ default: m.ProductFormPage })),
)
const ProductDetailPage = lazy(() =>
  import('@/pages/products/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })),
)

const InventoryPage = lazy(() =>
  import('@/pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })),
)
const MrpPage = lazy(() => import('@/pages/mrp/MrpPage').then((m) => ({ default: m.MrpPage })))
const InventoryAdjustPage = lazy(() =>
  import('@/pages/inventory/InventoryAdjustPage').then((m) => ({ default: m.InventoryAdjustPage })),
)

const QuotationsListPage = lazy(() =>
  import('@/pages/quotations/QuotationsListPage').then((m) => ({ default: m.QuotationsListPage })),
)
const QuotationFormPage = lazy(() =>
  import('@/pages/quotations/QuotationFormPage').then((m) => ({ default: m.QuotationFormPage })),
)
const QuotationDetailPage = lazy(() =>
  import('@/pages/quotations/QuotationDetailPage').then((m) => ({ default: m.QuotationDetailPage })),
)

const OrdersListPage = lazy(() =>
  import('@/pages/orders/OrdersListPage').then((m) => ({ default: m.OrdersListPage })),
)
const OrderFormPage = lazy(() =>
  import('@/pages/orders/OrderFormPage').then((m) => ({ default: m.OrderFormPage })),
)
const OrderDetailPage = lazy(() =>
  import('@/pages/orders/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })),
)
const ProductionListPage = lazy(() =>
  import('@/pages/production/ProductionListPage').then((m) => ({ default: m.ProductionListPage })),
)
const ProductionFormPage = lazy(() =>
  import('@/pages/production/ProductionFormPage').then((m) => ({ default: m.ProductionFormPage })),
)
const ProductionDetailPage = lazy(() =>
  import('@/pages/production/ProductionDetailPage').then((m) => ({ default: m.ProductionDetailPage })),
)

const UsersListPage = lazy(() =>
  import('@/pages/users/UsersListPage').then((m) => ({ default: m.UsersListPage })),
)
const UserFormPage = lazy(() =>
  import('@/pages/users/UserFormPage').then((m) => ({ default: m.UserFormPage })),
)
const UserDetailPage = lazy(() =>
  import('@/pages/users/UserDetailPage').then((m) => ({ default: m.UserDetailPage })),
)

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            {/* The password form moved into /profile; keep old links working. */}
            <Route path="/change-password" element={<Navigate to="/profile" replace />} />

            <Route path="/customers" element={<CustomersListPage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/customers/:id/edit" element={<CustomerFormPage />} />

            <Route path="/suppliers" element={<SuppliersListPage />} />
            <Route path="/suppliers/new" element={<SupplierFormPage />} />
            <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
            <Route path="/suppliers/:id/edit" element={<SupplierFormPage />} />

            <Route path="/raw-materials" element={<RawMaterialsListPage />} />
            <Route path="/raw-materials/new" element={<RawMaterialFormPage />} />
            <Route path="/raw-materials/:id" element={<RawMaterialDetailPage />} />
            <Route path="/raw-materials/:id/edit" element={<RawMaterialFormPage />} />

            <Route path="/products" element={<ProductsListPage />} />
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/products/:id/edit" element={<ProductFormPage />} />

            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/inventory/adjust" element={<InventoryAdjustPage />} />
            <Route path="/mrp" element={<MrpPage />} />

            <Route path="/quotations" element={<QuotationsListPage />} />
            <Route path="/quotations/new" element={<QuotationFormPage />} />
            <Route path="/quotations/:id" element={<QuotationDetailPage />} />
            <Route path="/quotations/:id/edit" element={<QuotationFormPage />} />

            <Route path="/orders" element={<OrdersListPage />} />
            <Route path="/orders/new" element={<OrderFormPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/orders/:id/edit" element={<OrderFormPage />} />
            <Route path="/production" element={<ProductionListPage />} />
            <Route path="/production/new" element={<ProductionFormPage />} />
            <Route path="/production/:id" element={<ProductionDetailPage />} />
            <Route path="/production/:id/edit" element={<ProductionFormPage />} />

            <Route path="/users" element={<UsersListPage />} />
            <Route path="/users/new" element={<UserFormPage />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/users/:id/edit" element={<UserFormPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
