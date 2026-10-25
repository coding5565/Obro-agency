import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { get } from '../../shared/api/client'
import type { Task } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, money } from '../../shared/lib/format'
import { Badge, Card, Empty, Kicker, PageHeader, Spinner, Stat } from '../../shared/ui'

interface Dashboard {
  my_tasks: { today: number; overdue: number; open: number }
  content: { in_client_review: number; in_internal_review: number; changes_requested: number; published_this_month: number }
  active_projects: number
  worklog_pending?: number
  finance?: { month_income_uzs: string; debt: Record<string, string>; overdue_invoices: number; draft_invoices: number }
  clients?: { active: number; leads: number; projects_by_tariff: Record<string, number> }
}

export function DashboardPage() {
  const { user } = useAuth()
  const data = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/dashboard/') })
  const tasks = useQuery({ queryKey: ['tasks', 'my'], queryFn: () => get<Task[]>('/tasks/my/') })
  if (data.isLoading) return <Spinner />
  const d = data.data
  if (!d) return null
  return (
    <>
      <PageHeader title="Assalomu alaykum," accent={`${user?.full_name.split(' ')[0]}!`} subtitle={`${d.active_projects} ta faol loyiha · bugun nima qilamiz?`} />
      {d.finance && d.clients && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Shu oy tushum" value={money(Math.round(Number(d.finance.month_income_uzs)), 'UZS')} />
          <Stat label="Qarz" value={Object.entries(d.finance.debt).map(([c, v]) => money(v, c)).join(' · ') || '—'}
            hint={d.finance.overdue_invoices ? <span className="text-bad">{d.finance.overdue_invoices} ta muddati o‘tgan</span> : 'Muddati o‘tgan yo‘q'} />
          <Stat label="Faol mijozlar" value={d.clients.active} hint={`${d.clients.leads} ta potensial`} />
          <Stat label="Tariflar" value={Object.values(d.clients.projects_by_tariff).reduce((a, b) => a + b, 0)}
            hint={Object.entries(d.clients.projects_by_tariff).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'} />
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mijoz tasdig‘ida" value={d.content.in_client_review} />
        <Stat label="Ichki tekshiruv" value={d.content.in_internal_review} hint={d.worklog_pending ? `${d.worklog_pending} ta jurnal yozuvi kutmoqda` : undefined} />
        <Stat label="Tuzatish so‘ralgan" value={d.content.changes_requested} />
        <Stat label="Shu oy joylandi" value={d.content.published_this_month} />
      </div>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <Kicker>Mening vazifalarim · bugun {d.my_tasks.today} · muddati o‘tgan {d.my_tasks.overdue}</Kicker>
          <Link to="/app/tasks" className="text-[12.5px] font-semibold text-bronze">Hammasi →</Link>
        </div>
        {tasks.data?.length === 0 && <Empty title="Ochiq vazifa yo‘q" hint="Yangi kontent rejaga qo‘shilganda vazifalar shu yerda paydo bo‘ladi." />}
        <div className="divide-y divide-line-soft">
          {tasks.data?.slice(0, 8).map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{t.title}</div>
                <div className="text-[12px] text-muted">{t.client_name}</div>
              </div>
              {t.is_overdue ? <Badge tone="bad">{date(t.due_date)}</Badge> : <span className="num text-[12px] text-muted">{date(t.due_date)}</span>}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
