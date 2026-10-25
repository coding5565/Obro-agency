import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { get } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, money, monthKey, num, pct } from '../../shared/lib/format'
import { Card, Empty, Kicker, PageHeader, Spinner, Stat } from '../../shared/ui'
import { MonthPicker } from '../team/Payroll'
import type { PortalDashboard } from './Home'

type Metric = NonNullable<PortalDashboard['metrics']>[number]
type Ads = NonNullable<PortalDashboard['ads']>

// Obunachilar grafigi: qora chiziq, ostida yumshoq oltin maydon (brendbukdagi gradientsiz).
export function FollowersChart({ points }: { points: { date: string; followers: number }[] }) {
  if (points.length < 2) return null
  const values = points.map((p) => p.followers)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 300
  const h = 90
  const coords = points.map((p, i) => [(i / (points.length - 1)) * w, h - 8 - ((p.followers - min) / span) * (h - 20)])
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Obunachilar o‘sishi">
        <polygon points={`0,${h} ${line} ${w},${h}`} fill="#ffb81c" opacity="0.22" />
        <polyline points={line} fill="none" stroke="#141414" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={last[0]} cy={last[1]} r="4" fill="#ffb81c" />
      </svg>
      <div className="num flex justify-between text-[11px] text-muted"><span>{date(points[0].date)}</span><span>{num(values[values.length - 1])}</span></div>
    </div>
  )
}

export function PortalResults() {
  const { user } = useAuth()
  const [month, setMonth] = useState(monthKey())
  const hasAds = user?.clients[0]?.features.includes('ads')
  const metrics = useQuery({ queryKey: ['portal', 'metrics'], queryFn: () => get<Metric[]>('/portal/metrics/') })
  const ads = useQuery({ queryKey: ['portal', 'ads', month], queryFn: () => get<Ads>('/portal/ads/', { month }), enabled: !!hasAds })
  if (metrics.isLoading) return <Spinner />
  return (
    <>
      <PageHeader title="Natijalar" subtitle="Ko‘rsatkichlar haftasiga bir marta yangilanadi." />
      {metrics.data?.length === 0 && <Empty title="Hali ko‘rsatkich kiritilmagan" />}
      {metrics.data?.map((m) => (
        <div key={m.account} className="mb-4">
          <Kicker>{m.account}</Kicker>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Obunachilar" value={num(m.followers)} hint={m.followers_change !== null ? `${m.followers_change >= 0 ? '+' : ''}${num(m.followers_change)} so‘nggi hafta` : undefined} />
            <Stat label="Agentlik bilan o‘sish" value={`${m.followers_since_start >= 0 ? '+' : ''}${num(m.followers_since_start)}`} />
            <Stat label="Qamrov · 7 kun" value={num(m.reach)} />
            <Stat label="Faollik (ER)" value={pct(m.engagement_rate)} />
          </div>
          <Card><FollowersChart points={m.history} /></Card>
        </div>
      ))}
      {hasAds && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between"><Kicker>Target reklama</Kicker><MonthPicker month={month} onChange={setMonth} /></div>
          {ads.data?.length === 0 && <Card><div className="text-muted">Bu oy reklama natijasi yo‘q</div></Card>}
          {ads.data?.map((a) => (
            <div key={a.currency} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Sarf" value={money(a.spend, a.currency)} />
              <Stat label="Lidlar" value={a.leads} />
              <Stat label="Lid narxi" value={a.cost_per_lead ? money(a.cost_per_lead, a.currency) : '—'} />
            </div>
          ))}
          <p className="mt-2 text-[12px] text-muted">Reklama budjeti paket narxiga kirmaydi va Meta’ga to‘g‘ridan-to‘g‘ri to‘lanadi.</p>
        </div>
      )}
    </>
  )
}
