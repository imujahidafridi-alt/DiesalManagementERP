import { lazy, Suspense } from 'react'
import { createHashRouter } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'

// Lazy load feature modules
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const PurchasesPage = lazy(() => import('@/features/purchases/PurchasesPage'))
const TransfersPage = lazy(() => import('@/features/transfers/TransfersPage'))
const SalesPage = lazy(() => import('@/features/sales/SalesPage'))
const DriversPage = lazy(() => import('@/features/drivers/DriversPage'))
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'))
const SuppliersPage = lazy(() => import('@/features/suppliers/SuppliersPage'))
const InventoryPage = lazy(() => import('@/features/inventory/InventoryPage'))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const AuditPage = lazy(() => import('@/features/audit/AuditPage'))
const ImportWizardPage = lazy(() => import('@/features/import/ImportWizardPage'))
const AboutPage = lazy(() => import('@/features/about/AboutPage'))

// Fallback spinner component
const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8 h-32 select-none">
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
  </div>
)

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'purchases',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <PurchasesPage />
          </Suspense>
        ),
      },
      {
        path: 'transfers',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <TransfersPage />
          </Suspense>
        ),
      },
      {
        path: 'sales',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <SalesPage />
          </Suspense>
        ),
      },
      {
        path: 'drivers',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <DriversPage />
          </Suspense>
        ),
      },
      {
        path: 'customers',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <CustomersPage />
          </Suspense>
        ),
      },
      {
        path: 'suppliers',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <SuppliersPage />
          </Suspense>
        ),
      },
      {
        path: 'inventory',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <InventoryPage />
          </Suspense>
        ),
      },
      {
        path: 'reports',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ReportsPage />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <SettingsPage />
          </Suspense>
        ),
      },
      {
        path: 'audit',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <AuditPage />
          </Suspense>
        ),
      },
      {
        path: 'import',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ImportWizardPage />
          </Suspense>
        ),
      },
      {
        path: 'about',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <AboutPage />
          </Suspense>
        ),
      },
    ],
  },
])
