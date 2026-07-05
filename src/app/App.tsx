import { RouterProvider } from 'react-router-dom'
import { router } from '../routes'
import ErrorBoundary from '@/components/common/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
