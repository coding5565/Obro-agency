import { Activity, BadgeDollarSign, CalendarDays, Camera, ClipboardList, FileText, Gauge, History, LayoutDashboard, Magnet, NotebookPen, Package, Users, UsersRound, Wallet } from 'lucide-react'
import { useLocation } from 'react-router'
import { Shell } from './Shell'
import type { NavItem } from './Shell'
import { useAuth } from '../shared/auth/AuthProvider'
import { hasUnseenRelease } from '../shared/changelog'

const ITEMS: (NavItem & { perm?: string })[] = [
  { to: '/app', label: 'Bosh sahifa', icon: <LayoutDashboard size={17} />, end: true },
  { to: '/app/clients', label: 'Mijozlar', icon: <UsersRound size={17} />, perm: 'clients.view' },
  { to: '/app/leads', label: 'Lidlar', icon: <Magnet size={17} />, perm: 'leads.view' },
  { to: '/app/content', label: 'Kontent', icon: <CalendarDays size={17} />, perm: 'content.view' },
  { to: '/app/schedule', label: 'Syomka', icon: <Camera size={17} />, perm: 'content.view' },
  { to: '/app/briefs', label: 'TZ', icon: <FileText size={17} />, perm: 'content.view' },
  { to: '/app/tasks', label: 'Vazifalar', icon: <ClipboardList size={17} />, perm: 'tasks.view' },
  { to: '/app/worklog', label: 'Ish jurnali', icon: <NotebookPen size={17} />, perm: 'worklog.create' },
  { to: '/app/metrics', label: 'Ko‘rsatkichlar', icon: <Gauge size={17} />, perm: 'metrics.manage' },
  { to: '/app/finance', label: 'Moliya', icon: <Wallet size={17} />, perm: 'finance.manage' },
  { to: '/app/payroll', label: 'Maosh', icon: <BadgeDollarSign size={17} />, perm: 'payroll.manage' },
  { to: '/app/me', label: 'Mening hisobim', icon: <BadgeDollarSign size={17} />, perm: 'payroll.view_own' },
  { to: '/app/tariffs', label: 'Tariflar', icon: <Package size={17} />, perm: 'catalog.view' },
  { to: '/app/team', label: 'Jamoa', icon: <Users size={17} />, perm: 'users.view' },
  { to: '/app/activity', label: 'Harakatlar', icon: <Activity size={17} />, perm: 'audit.view' },
  { to: '/app/versions', label: 'Versiyalar', icon: <History size={17} /> },
]

export function StaffLayout() {
  const { can } = useAuth()
  const location = useLocation()
  const unseen = location.pathname !== '/app/versions' && hasUnseenRelease()
  const nav = ITEMS.filter((item) => !item.perm || can(item.perm))
    .map((item) => (item.to === '/app/versions' && unseen ? { ...item, badge: 1 } : item))
  return <Shell nav={nav} />
}
