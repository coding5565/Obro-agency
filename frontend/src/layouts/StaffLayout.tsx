import { BadgeDollarSign, CalendarDays, Camera, ClipboardList, FileText, Gauge, LayoutDashboard, Magnet, NotebookPen, Package, Users, UsersRound, Wallet } from 'lucide-react'
import { Shell } from './Shell'
import type { NavItem } from './Shell'
import { useAuth } from '../shared/auth/AuthProvider'

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
]

export function StaffLayout() {
  const { can } = useAuth()
  const nav = ITEMS.filter((item) => !item.perm || can(item.perm))
  return <Shell nav={nav} />
}
