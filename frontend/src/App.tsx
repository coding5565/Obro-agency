import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { PortalLayout } from './layouts/PortalLayout'
import { StaffLayout } from './layouts/StaffLayout'
import { AcceptInvitePage } from './pages/AcceptInvite'
import { LoginPage } from './pages/Login'
import { NotificationsPage } from './pages/Notifications'
import { PortalApprovalDetail, PortalApprovals } from './pages/portal/Approvals'
import { PortalCalendar } from './pages/portal/Calendar'
import { PortalHome } from './pages/portal/Home'
import { PortalInvoices } from './pages/portal/Invoices'
import { PortalRequest } from './pages/portal/Request'
import { PortalResults } from './pages/portal/Results'
import { PortalWorklog } from './pages/portal/Worklog'
import { ClientDetailPage } from './pages/team/ClientDetail'
import { ClientsPage } from './pages/team/Clients'
import { ContentDetailPage } from './pages/team/ContentDetail'
import { ContentPage } from './pages/team/Content'
import { DashboardPage } from './pages/team/Dashboard'
import { FinancePage } from './pages/team/Finance'
import { MetricsPage } from './pages/team/Metrics'
import { MyPayrollPage } from './pages/team/MyPayroll'
import { PayrollPage } from './pages/team/Payroll'
import { TariffsPage } from './pages/team/Tariffs'
import { TasksPage } from './pages/team/Tasks'
import { TeamPage } from './pages/team/Team'
import { WorklogPage } from './pages/team/Worklog'
import { AuthProvider, useAuth } from './shared/auth/AuthProvider'
import { Empty, Spinner } from './shared/ui'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } },
})

function Guard({ kind, children }: { kind: 'staff' | 'client'; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (kind === 'client' && !user.is_client) return <Navigate to="/app" replace />
  if (kind === 'staff' && user.is_client) return <Navigate to="/portal" replace />
  return <>{children}</>
}

// Bo'limga ruxsati yo'q xodim manzilni qo'lda yozsa — bo'sh sahifa emas, aniq xabar.
function Need({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(perm)) return <Empty title="Bu bo‘limga ruxsatingiz yo‘q" hint="Kerak bo‘lsa, rahbarga murojaat qiling." />
  return <>{children}</>
}

function Home() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.is_client ? '/portal' : '/app'} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<AcceptInvitePage />} />
            <Route path="/app" element={<Guard kind="staff"><StaffLayout /></Guard>}>
              <Route index element={<DashboardPage />} />
              <Route path="clients" element={<Need perm="clients.view"><ClientsPage /></Need>} />
              <Route path="clients/:id" element={<Need perm="clients.view"><ClientDetailPage /></Need>} />
              <Route path="content" element={<Need perm="content.view"><ContentPage /></Need>} />
              <Route path="content/:id" element={<Need perm="content.view"><ContentDetailPage /></Need>} />
              <Route path="tasks" element={<Need perm="tasks.view"><TasksPage /></Need>} />
              <Route path="tasks/:id" element={<Need perm="tasks.view"><TasksPage /></Need>} />
              <Route path="worklog" element={<Need perm="worklog.create"><WorklogPage /></Need>} />
              <Route path="metrics" element={<Need perm="metrics.manage"><MetricsPage /></Need>} />
              <Route path="finance" element={<Need perm="finance.manage"><FinancePage /></Need>} />
              <Route path="payroll" element={<Need perm="payroll.manage"><PayrollPage /></Need>} />
              <Route path="me" element={<Need perm="payroll.view_own"><MyPayrollPage /></Need>} />
              <Route path="tariffs" element={<Need perm="catalog.view"><TariffsPage /></Need>} />
              <Route path="team" element={<Need perm="users.view"><TeamPage /></Need>} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>
            <Route path="/portal" element={<Guard kind="client"><PortalLayout /></Guard>}>
              <Route index element={<PortalHome />} />
              <Route path="calendar" element={<PortalCalendar />} />
              <Route path="approvals" element={<PortalApprovals />} />
              <Route path="approvals/:id" element={<PortalApprovalDetail />} />
              <Route path="worklog" element={<PortalWorklog />} />
              <Route path="results" element={<PortalResults />} />
              <Route path="invoices" element={<PortalInvoices />} />
              <Route path="request" element={<PortalRequest />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
