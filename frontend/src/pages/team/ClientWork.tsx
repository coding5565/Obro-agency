import { useQuery } from '@tanstack/react-query'
import { Camera, CalendarDays, ClipboardList, FileText, Magnet, Plus, Receipt } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { get } from '../../shared/api/client'
import type { ContentItem, Invoice, Page, Payment, Task } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, dateTime, money, monthKey, today } from '../../shared/lib/format'
import { Badge, Card, Kicker, StatusBadge } from '../../shared/ui'
import { LEAD_TONE } from './Leads'

interface BriefRow { id: number; title: string; assignee_name: string; deadline: string | null; status: string; status_label: string; is_overdue: boolean }
interface ShootRow { id: number; date: string; start_time: string | null; location: string; participant_names: string[]; client_confirmed_at: string | null }
interface LeadRow { id: number; full_name: string; phone: string; status: string; status_label: string; created_at: string }

function Section({ title, icon, more, add, children, empty }: { title: string; icon: ReactNode; more: string; add?: string; children: ReactNode; empty: boolean }) {
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><span className="text-bronze">{icon}</span><Kicker>{title}</Kicker></span>
        <span className="flex items-center gap-1">
          {add && <Link to={add} aria-label={`${title}: qo‘shish`} className="grid h-9 w-9 place-items-center rounded-lg text-bronze hover:bg-ivory"><Plus size={17} /></Link>}
          <Link to={more} className="inline-flex min-h-9 items-center px-1 text-[12.5px] font-semibold text-bronze">Hammasi →</Link>
        </span>
      </div>
      {empty ? <div className="py-3 text-[13px] text-muted">Hozircha yo‘q</div> : <div className="divide-y divide-line-soft">{children}</div>}
    </Card>
  )
}

function Row({ to, title, sub, right }: { to: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <Link to={to} className="flex min-h-12 items-center gap-3 py-2 hover:bg-ivory/50">
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{title}</span>{sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}</span>
      {right}
    </Link>
  )
}

// Bitta mijoz bo'yicha hamma ish bir joyda (barcha loyihalari): kontent, TZ, syomka, vazifa, lid va to'lov.
// «+» tugmalari mijozning eng yangi faol loyihasini oldindan tanlab ochadi.
export function ClientWork({ projectId, clientId }: { projectId: number; clientId: number }) {
  const { can } = useAuth()
  const month = monthKey()
  const content = useQuery({ queryKey: ['content', 'client', clientId, month], queryFn: () => get<Page<ContentItem>>('/content/items/', { project__client: clientId, month, page_size: 300 }) })
  const briefs = useQuery({ queryKey: ['briefs', 'client', clientId], queryFn: () => get<Page<BriefRow>>('/content/briefs/', { project__client: clientId, page_size: 50 }) })
  const shoots = useQuery({ queryKey: ['shoots', 'client', clientId], queryFn: () => get<Page<ShootRow>>('/content/shoot-days/', { project__client: clientId, from: today(), status: 'planned', page_size: 5 }) })
  const tasks = useQuery({ queryKey: ['tasks', 'client', clientId], queryFn: () => get<Page<Task>>('/tasks/', { project__client: clientId, page_size: 100 }) })
  const leads = useQuery({ queryKey: ['leads', 'client', clientId], queryFn: () => get<Page<LeadRow>>('/leads/items/', { project__client: clientId, page_size: 6 }), enabled: can('leads.view') })
  const invoices = useQuery({ queryKey: ['invoices', 'client', clientId], queryFn: () => get<Page<Invoice>>('/finance/invoices/', { project__client: clientId, page_size: 6 }), enabled: can('finance.manage') })
  const payments = useQuery({ queryKey: ['payments', 'client', clientId], queryFn: () => get<Page<Payment>>('/finance/payments/', { client: clientId, page_size: 5 }), enabled: can('finance.manage') })

  const items = (content.data?.results ?? []).filter((i) => i.status !== 'cancelled')
  const published = items.filter((i) => i.status === 'published').length
  const openBriefs = (briefs.data?.results ?? []).filter((b) => !['done', 'cancelled'].includes(b.status))
  const openTasks = (tasks.data?.results ?? []).filter((t) => ['todo', 'in_progress'].includes(t.status))
  const manage = can('content.manage')

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section title={`Kontent · shu oy ${published}/${items.length} joylandi`} icon={<CalendarDays size={16} />} more={`/app/content?project=${projectId}`}
        add={manage ? `/app/content?project=${projectId}&new=1` : undefined} empty={items.length === 0}>
        {items.slice(0, 6).map((i) => <Row key={i.id} to={`/app/content/${i.id}`} title={i.title} sub={`${i.kind_label} · ${date(i.planned_date)}`} right={<StatusBadge status={i.status} label={i.status_label} />} />)}
      </Section>
      <Section title={`TZ · ochiq ${openBriefs.length}`} icon={<FileText size={16} />} more="/app/briefs"
        add={manage ? `/app/briefs?new=1&project=${projectId}` : undefined} empty={openBriefs.length === 0}>
        {openBriefs.slice(0, 5).map((b) => <Row key={b.id} to={`/app/briefs/${b.id}`} title={b.title} sub={`${b.assignee_name} · ${dateTime(b.deadline)}`}
          right={b.is_overdue ? <Badge tone="bad">Kechikdi</Badge> : <StatusBadge status={b.status} label={b.status_label} />} />)}
      </Section>
      <Section title="Yaqin syomkalar" icon={<Camera size={16} />} more="/app/schedule"
        add={manage ? `/app/schedule?new=1&project=${projectId}` : undefined} empty={!shoots.data?.results.length}>
        {shoots.data?.results.map((s) => <Row key={s.id} to="/app/schedule" title={`${date(s.date)} ${s.start_time?.slice(0, 5) ?? ''}`} sub={[s.location, s.participant_names.join(', ')].filter(Boolean).join(' · ')}
          right={s.client_confirmed_at ? <Badge tone="ok">Tasdiqlandi</Badge> : <Badge tone="warn">Kutilmoqda</Badge>} />)}
      </Section>
      <Section title={`Vazifalar · ochiq ${openTasks.length}`} icon={<ClipboardList size={16} />} more="/app/tasks"
        add={can('tasks.manage') ? `/app/tasks?new=1&project=${projectId}` : undefined} empty={openTasks.length === 0}>
        {openTasks.slice(0, 6).map((t) => <Row key={t.id} to={t.content_item ? `/app/content/${t.content_item}` : '/app/tasks'} title={t.title} sub={t.assignee_name ?? 'Biriktirilmagan'}
          right={t.is_overdue ? <Badge tone="bad">{date(t.due_date)}</Badge> : <span className="num text-[12px] text-muted">{date(t.due_date)}</span>} />)}
      </Section>
      {can('leads.view') && (
        <Section title="So‘nggi lidlar" icon={<Magnet size={16} />} more={`/app/leads`} empty={!leads.data?.results.length}>
          {leads.data?.results.map((l) => <Row key={l.id} to={`/app/leads?lead=${l.id}`} title={l.full_name || 'Ismsiz'} sub={`${l.phone} · ${dateTime(l.created_at)}`} right={<Badge tone={LEAD_TONE[l.status]} dot>{l.status_label}</Badge>} />)}
        </Section>
      )}
      {can('finance.manage') && (
        <Section title="To‘lovlar" icon={<Receipt size={16} />} more="/app/finance?tab=invoices" empty={!invoices.data?.results.length && !payments.data?.results.length}>
          {invoices.data?.results.map((inv) => <Row key={`i${inv.id}`} to="/app/finance?tab=invoices" title={`${inv.number} · ${money(inv.total, inv.currency)}`} sub={`${date(inv.period_start)}–${date(inv.period_end)} · qoldiq ${money(inv.outstanding, inv.currency)}`} right={<StatusBadge status={inv.status} label={inv.status_label} />} />)}
          {payments.data?.results.filter((p) => !p.cancelled_at).map((p) => <Row key={`p${p.id}`} to="/app/finance?tab=payments" title={`To‘lov ${money(p.amount, p.currency)}`} sub={date(p.paid_on)} right={<Badge tone="ok">Tushdi</Badge>} />)}
        </Section>
      )}
    </div>
  )
}
