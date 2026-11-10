import { Activity, BadgeDollarSign, CalendarDays, Camera, ClipboardList, FileText, Gauge, History, LayoutDashboard, Magnet, NotebookPen, Package, Users, UsersRound, Wallet } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Shell } from './Shell'
import type { NavItem, QuickItem } from './Shell'
import { useAuth } from '../shared/auth/AuthProvider'
import { hasUnseenRelease, LATEST_VERSION } from '../shared/changelog'

// Menyu uch guruhda: kundalik ish, o'zim, boshqaruv. Har kim faqat ruxsati bor bo'limlarni ko'radi.
const ITEMS: (NavItem & { perm?: string })[] = [
  { to: '/app', label: 'Bugun', icon: <LayoutDashboard size={17} />, end: true },
  { section: 'Ish', to: '/app/clients', label: 'Mijozlar', icon: <UsersRound size={17} />, perm: 'clients.view' },
  { section: 'Ish', to: '/app/content', label: 'Kontent reja', icon: <CalendarDays size={17} />, perm: 'content.view' },
  { section: 'Ish', to: '/app/briefs', label: 'TZ', icon: <FileText size={17} />, perm: 'content.view' },
  { section: 'Ish', to: '/app/schedule', label: 'Syomka', icon: <Camera size={17} />, perm: 'content.view' },
  { section: 'Ish', to: '/app/tasks', label: 'Vazifalar', icon: <ClipboardList size={17} />, perm: 'tasks.view' },
  { section: 'Ish', to: '/app/leads', label: 'Lidlar', icon: <Magnet size={17} />, perm: 'leads.view' },
  { section: 'Ish', to: '/app/metrics', label: 'Ko‘rsatkichlar', icon: <Gauge size={17} />, perm: 'metrics.manage' },
  { section: 'Men', to: '/app/worklog', label: 'Ish jurnali', icon: <NotebookPen size={17} />, perm: 'worklog.create' },
  { section: 'Men', to: '/app/me', label: 'Mening hisobim', icon: <BadgeDollarSign size={17} />, perm: 'payroll.view_own' },
  { section: 'Boshqaruv', to: '/app/finance', label: 'Moliya', icon: <Wallet size={17} />, perm: 'finance.manage' },
  { section: 'Boshqaruv', to: '/app/payroll', label: 'Maosh', icon: <BadgeDollarSign size={17} />, perm: 'payroll.manage' },
  { section: 'Boshqaruv', to: '/app/team', label: 'Jamoa', icon: <Users size={17} />, perm: 'users.view' },
  { section: 'Boshqaruv', to: '/app/tariffs', label: 'Tariflar', icon: <Package size={17} />, perm: 'catalog.view' },
  { section: 'Boshqaruv', to: '/app/activity', label: 'Harakatlar', icon: <Activity size={17} />, perm: 'audit.view' },
]

const QUICK: (QuickItem & { perm: string })[] = [
  { to: '/app/tasks?new=1', label: 'Vazifa', icon: <ClipboardList size={16} />, perm: 'tasks.manage' },
  { to: '/app/briefs?new=1', label: 'TZ', icon: <FileText size={16} />, perm: 'content.manage' },
  { to: '/app/schedule?new=1', label: 'Syomka', icon: <Camera size={16} />, perm: 'content.manage' },
  { to: '/app/content?new=1', label: 'Kontent', icon: <CalendarDays size={16} />, perm: 'content.manage' },
  { to: '/app/leads?new=1', label: 'Lid', icon: <Magnet size={16} />, perm: 'leads.manage' },
  { to: '/app/worklog', label: 'Ish jurnaliga yozuv', icon: <NotebookPen size={16} />, perm: 'worklog.create' },
]

export function StaffLayout() {
  const { can } = useAuth()
  const location = useLocation()
  const unseen = location.pathname !== '/app/versions' && hasUnseenRelease()
  const nav = ITEMS.filter((item) => !item.perm || can(item.perm))
  const quick = QUICK.filter((item) => can(item.perm))
  const bottom = (
    <Link to="/app/versions" className="mb-3 flex min-h-9 items-center gap-2 px-3 text-[12px] text-muted-2 hover:text-ivory">
      <History size={14} />Versiyalar · v{LATEST_VERSION}
      {unseen && <span className="ml-auto rounded-full bg-gold px-2 text-[10.5px] leading-5 font-bold text-ink">yangi</span>}
    </Link>
  )
  return <Shell nav={nav} quick={quick} bottom={bottom} />
}
