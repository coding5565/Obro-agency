import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { PortalLayout } from './layouts/PortalLayout'
import { StaffLayout } from './layouts/StaffLayout'
import { AcceptInvitePage } from './pages/AcceptInvite'
import { NotificationsPage } from './pages/Notifications'
import { ProfilePage } from './pages/Profile'
import { PortalApprovalDetail, PortalApprovals } from './pages/portal/Approvals'
import { PortalCalendar } from './pages/portal/Calendar'
import { PortalHome } from './pages/portal/Home'
import { PortalInvoices } from './pages/portal/Invoices'
import { PortalLeads } from './pages/portal/Leads'
import { PortalRequest } from './pages/portal/Request'
import { PortalResults } from './pages/portal/Results'
import { PortalShoots } from './pages/portal/Shoots'
import { PortalWorklog } from './pages/portal/Worklog'
import { ActivityPage } from './pages/team/Activity'
import { BriefDetailPage, BriefsPage } from './pages/team/Briefs'
import { ClientDetailPage } from './pages/team/ClientDetail'
import { ClientsPage } from './pages/team/Clients'
import { ContentDetailPage } from './pages/team/ContentDetail'
import { ContentPage } from './pages/team/Content'
import { DashboardPage } from './pages/team/Dashboard'
import { FinancePage } from './pages/team/Finance'
import { LeadsPage } from './pages/team/Leads'
import { MetricsPage } from './pages/team/Metrics'
import { MyPayrollPage } from './pages/team/MyPayroll'
import { PayrollPage } from './pages/team/Payroll'
import { SchedulePage } from './pages/team/Schedule'
import { TariffsPage } from './pages/team/Tariffs'
import { TasksPage } from './pages/team/Tasks'
import { TeamPage } from './pages/team/Team'
import { VersionsPage } from './pages/team/Versions'
import { WorklogPage } from './pages/team/Worklog'
import { LoginPage } from './pages/Login'
import { useAuth } from './shared/auth/AuthProvider'
import { Empty, Spinner } from './shared/ui'

function Guard({ kind, children }: { kind: 'staff' | 'client'; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to={kind === 'staff' ? '/jamoa' : '/login'} state={{ from: location.pathname }} replace />
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

export default function PanelRoutes() {
  useEffect(() => { document.title = 'OBRO’ Panel' }, [])
  return (
    <Routes>
      <Route path="login" element={<LoginPage door="client" />} />
      <Route path="jamoa" element={<LoginPage door="staff" />} />
      <Route path="invite/:token" element={<AcceptInvitePage />} />
        <Route path="app" element={<Guard kind="staff"><StaffLayout /></Guard>}>
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<Need perm="clients.view"><ClientsPage /></Need>} />
          <Route path="clients/:id" element={<Need perm="clients.view"><ClientDetailPage /></Need>} />
          <Route path="content" element={<Need perm="content.view"><ContentPage /></Need>} />
          <Route path="content/:id" element={<Need perm="content.view"><ContentDetailPage /></Need>} />
          <Route path="schedule" element={<Need perm="content.view"><SchedulePage /></Need>} />
          <Route path="briefs" element={<Need perm="content.view"><BriefsPage /></Need>} />
          <Route path="briefs/:id" element={<Need perm="content.view"><BriefDetailPage /></Need>} />
          <Route path="leads" element={<Need perm="leads.view"><LeadsPage /></Need>} />
          <Route path="tasks" element={<Need perm="tasks.view"><TasksPage /></Need>} />
          <Route path="tasks/:id" element={<Need perm="tasks.view"><TasksPage /></Need>} />
          <Route path="worklog" element={<Need perm="worklog.create"><WorklogPage /></Need>} />
          <Route path="metrics" element={<Need perm="metrics.manage"><MetricsPage /></Need>} />
          <Route path="finance" element={<Need perm="finance.manage"><FinancePage /></Need>} />
          <Route path="payroll" element={<Need perm="payroll.manage"><PayrollPage /></Need>} />
          <Route path="me" element={<Need perm="payroll.view_own"><MyPayrollPage /></Need>} />
          <Route path="tariffs" element={<Need perm="catalog.view"><TariffsPage /></Need>} />
          <Route path="team" element={<Need perm="users.view"><TeamPage /></Need>} />
          <Route path="activity" element={<Need perm="audit.view"><ActivityPage /></Need>} />
          <Route path="versions" element={<VersionsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="portal" element={<Guard kind="client"><PortalLayout /></Guard>}>
          <Route index element={<PortalHome />} />
          <Route path="calendar" element={<PortalCalendar />} />
          <Route path="approvals" element={<PortalApprovals />} />
          <Route path="approvals/:id" element={<PortalApprovalDetail />} />
          <Route path="worklog" element={<PortalWorklog />} />
          <Route path="leads" element={<PortalLeads />} />
          <Route path="shoots" element={<PortalShoots />} />
          <Route path="results" element={<PortalResults />} />
          <Route path="invoices" element={<PortalInvoices />} />
          <Route path="request" element={<PortalRequest />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
