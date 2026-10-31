import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { LandingPage } from './pages/landing/Landing'
import { AuthProvider } from './shared/auth/AuthProvider'
import { Spinner } from './shared/ui'

// Panel kodi alohida yuklanadi: landing tez ochilishi uchun tashrif buyuruvchi uni umuman yuklab olmaydi.
const PanelRoutes = lazy(() => import('./PanelRoutes'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<Suspense fallback={<Spinner />}><PanelRoutes /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
