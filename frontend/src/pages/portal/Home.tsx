import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { get } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, money, num, pct } from '../../shared/lib/format'
import { Badge, Card, Empty, Kicker, PageHeader, Ring, Spinner } from '../../shared/ui'
import type { Tone } from '../../shared/ui'
import { FollowersChart } from './Results'

export interface PortalDashboard {
  client: { id: number; name: string }
  features: string[]
  project: null | {
    tariff: string
    period_start: string
    period_end: string
    limits: { kind: string; done: number; planned: number; time_percent: number; done_percent: number; status: string }[]
    next_payment_date: string
    monthly_amount: string | null
    currency: string
    manager: { full_name: string } | null
  }
  approvals: { count: number; items: { id: number; kind_label: string; title: string; version: { file_url: string | null; link: string } | null }[] }
  today?: { time: string; kind_label: string; title: string; quantity: number }[]
  metrics?: { account: string; followers: number; followers_change: number | null; followers_since_start: number; reach: number | null; engagement_rate: string | null; history: { date: string; followers: number }[] }[]
  ads?: { currency: string; spend: string; leads: number; cost_per_lead: string | null }[]
  shoot_days: { date: string; location: string }[]
}

const PACE: Record<string, [Tone, string]> = {
  on_track: ['ok', 'Reja bo‘yicha me’yorda'],
  ahead: ['ok', 'Rejadan oldinda'],
  behind: ['warn', 'Rejadan biroz orqada'],
}
const KIND: Record<string, string> = { reels: 'Reels', post: 'Post', stories: 'Stories', video: 'Video' }

export function PortalHome() {
  const { user } = useAuth()
  const data = useQuery({ queryKey: ['portal', 'dashboard'], queryFn: () => get<PortalDashboard>('/portal/dashboard/') })
  if (data.isLoading) return <Spinner />
  const d = data.data
  if (!d) return null
  const p = d.project
  const slowest = p?.limits.reduce((a, b) => (a && a.done_percent <= b.done_percent ? a : b), p.limits[0])
  const pace = slowest ? PACE[slowest.status] : null
  const instagram = d.metrics?.[0]
  const ads = d.ads?.[0]
  return (
    <>
      <PageHeader
        title="Assalomu alaykum,"
        accent={`${user?.full_name.split(' ')[0] ?? ''}!`}
        subtitle={p ? `${d.client.name} · ${p.tariff} · ${date(p.period_start)}–${date(p.period_end)}` : d.client.name}
        actions={p && <div className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px]">Keyingi to‘lov: <b className="num">{date(p.next_payment_date)}{p.monthly_amount && ` · ${money(p.monthly_amount, p.currency)}`}</b></div>}
      />
      {!p ? <Card><Empty title="Faol loyiha yo‘q" hint="Agentlik loyihani ochgach, bu yerda ish jarayoni ko‘rinadi." /></Card> : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <Kicker>Bu oy bajarilishi</Kicker>
              <div className="flex flex-wrap justify-around gap-3">
                {p.limits.map((l) => <Ring key={l.kind} done={l.done} planned={l.planned} label={KIND[l.kind] ?? l.kind} size={86} />)}
              </div>
              {pace && slowest && <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted"><Badge tone={pace[0]}>{pace[1]}</Badge>oyning {slowest.time_percent}% o‘tdi</div>}
            </Card>
            <Card className="lg:col-span-2">
              <div className="mb-2 flex items-center justify-between"><Kicker>Tasdiqlash kutmoqda · {d.approvals.count}</Kicker>{d.approvals.count > 0 && <Link to="/portal/approvals" className="text-[12.5px] font-semibold text-bronze">Hammasi →</Link>}</div>
              {d.approvals.count === 0 ? <Empty title="Hammasi tasdiqlangan" hint="Yangi material tayyor bo‘lsa, shu yerda paydo bo‘ladi." /> : (
                <div className="grid grid-cols-2 gap-2">
                  {d.approvals.items.slice(0, 2).map((a) => (
                    <Link key={a.id} to={`/portal/approvals/${a.id}`} className="group">
                      <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-graphite to-ink text-[20px] text-gold group-hover:brightness-125">▶</div>
                      <div className="mt-1 text-[12.5px] leading-snug"><b>{a.kind_label}:</b> {a.title}</div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
          {(instagram || ads) && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {instagram && <Card cut><Kicker>Obunachilar</Kicker><div className="font-display text-[20px] font-semibold">{num(instagram.followers)}</div>{instagram.followers_change !== null && <div className="text-[12px] text-ok">+{num(instagram.followers_change)} shu hafta</div>}</Card>}
              {instagram && <Card cut><Kicker>Qamrov · 7 kun</Kicker><div className="font-display text-[20px] font-semibold">{num(instagram.reach)}</div><div className="text-[12px] text-muted">ER {pct(instagram.engagement_rate)}</div></Card>}
              {ads && <Card cut><Kicker>Lidlar · oy</Kicker><div className="font-display text-[20px] font-semibold">{ads.leads}</div><div className="text-[12px] text-muted">target reklamadan</div></Card>}
              {ads && <Card cut><Kicker>Lid narxi</Kicker><div className="font-display text-[20px] font-semibold">{ads.cost_per_lead ? money(ads.cost_per_lead, ads.currency) : '—'}</div><div className="text-[12px] text-muted">sarf {money(ads.spend, ads.currency)}</div></Card>}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-5">
            {d.today && (
              <Card className="lg:col-span-3">
                <div className="mb-1 flex items-center justify-between"><Kicker>Bugun nima qilindi</Kicker><Link to="/portal/worklog" className="text-[12.5px] font-semibold text-bronze">Tarix →</Link></div>
                {d.today.length === 0 && <div className="py-4 text-muted">Bugun hali yozuv yo‘q. Jamoa ishni tugatganda shu yerda ko‘rinadi.</div>}
                {d.today.map((e, i) => (
                  <div key={i} className="flex gap-3 border-b border-dashed border-line py-2 last:border-0">
                    <span className="num w-11 shrink-0 text-muted">{e.time}</span>
                    <span className="min-w-0"><Badge tone="draft">{e.kind_label}</Badge> {e.title}</span>
                  </div>
                ))}
              </Card>
            )}
            <div className="space-y-4 lg:col-span-2">
              {instagram && instagram.history.length > 1 && <Card><Kicker>Obunachilar · {instagram.history.length} hafta</Kicker><FollowersChart points={instagram.history} /></Card>}
              <Card>
                <Kicker>Jamoa</Kicker>
                <div>Mas’ul SMM menejer: <b>{p.manager?.full_name ?? '—'}</b></div>
                {d.shoot_days.length > 0 && <div className="mt-2 text-[13px]">Suratga olish: {d.shoot_days.map((s) => date(s.date)).join(', ')}</div>}
                <Link to="/portal/request" className="mt-3 inline-block font-semibold text-bronze">So‘rov yuborish →</Link>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  )
}
