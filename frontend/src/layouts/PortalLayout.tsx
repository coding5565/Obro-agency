import { useQuery } from '@tanstack/react-query'
import { BarChart3, CalendarDays, Camera, CheckCircle2, Home, Magnet, MessageSquarePlus, NotebookPen, Receipt } from 'lucide-react'
import { Shell } from './Shell'
import type { NavItem } from './Shell'
import { get } from '../shared/api/client'
import { useAuth } from '../shared/auth/AuthProvider'

const LOCKED = 'Tarifingizda yoqilmagan'

export function PortalLayout() {
  const { user } = useAuth()
  const access = user?.clients[0]
  const features = new Set(access?.features ?? [])
  const approvals = useQuery({
    queryKey: ['portal', 'approvals'],
    queryFn: () => get<unknown[]>('/portal/approvals/'),
    enabled: features.has('approvals'),
  })
  const item = (feature: string, nav: NavItem): NavItem => (features.has(feature) ? nav : { ...nav, locked: LOCKED })
  const nav: NavItem[] = [
    { to: '/portal', label: 'Bosh sahifa', icon: <Home size={17} />, end: true },
    item('calendar', { section: 'Ish', to: '/portal/calendar', label: 'Kalendar', icon: <CalendarDays size={17} /> }),
    item('approvals', { section: 'Ish', to: '/portal/approvals', label: 'Tasdiqlash', icon: <CheckCircle2 size={17} />, badge: approvals.data?.length }),
    { section: 'Ish', to: '/portal/shoots', label: 'Syomka kunlari', icon: <Camera size={17} /> },
    item('worklog', { section: 'Ish', to: '/portal/worklog', label: 'Bugun nima qilindi', icon: <NotebookPen size={17} /> }),
    item('metrics', { section: 'Natija', to: '/portal/results', label: 'Natijalar', icon: <BarChart3 size={17} /> }),
    item('leads', { section: 'Natija', to: '/portal/leads', label: 'Lidlar', icon: <Magnet size={17} /> }),
  ]
  if (access?.can_see_payments) nav.push(item('invoices', { section: 'Hisob', to: '/portal/invoices', label: 'To‘lovlar', icon: <Receipt size={17} /> }))
  nav.push(item('requests', { section: 'Hisob', to: '/portal/request', label: 'So‘rov yuborish', icon: <MessageSquarePlus size={17} /> }))
  return (
    <Shell nav={nav} footer={
      <div className="rounded-xl bg-ink-2 px-3 py-2.5">
        <div className="mono text-[10px] tracking-[0.14em] text-muted-2 uppercase">Tarif</div>
        <div className="flex items-baseline justify-between gap-2"><span className="truncate font-bold text-ivory">{access?.name}</span><span className="font-display text-[12px] font-bold text-gold">{access?.tariff}</span></div>
      </div>
    } />
  )
}
