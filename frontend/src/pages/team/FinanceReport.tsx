import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { downloadFile, get, post } from '../../shared/api/client'
import type { ClientProfit, MonthSummary, TrendRow } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { money, monthKey, monthLabel, pct } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Kicker, Spinner, Stat, Table } from '../../shared/ui'
import { MonthPicker } from './Payroll'

const round = (value: string | number) => money(Math.round(Number(value)))

const minus = (value: string) => (Number(value) ? `−${round(value)}` : round(value))

function compact(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} mln`
  if (abs >= 1_000) return `${Math.round(value / 1_000)} ming`
  return String(Math.round(value))
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 py-1.5 ${strong ? 'border-t border-line pt-2.5 font-bold' : ''}`}><span>{label}</span><span className="num whitespace-nowrap">{value}</span></div>
}

// Bitta ko'rsatkich (sof foyda) 12 oy bo'yicha: nol chizig'idan yuqori foyda, pastga zarar.
function TrendChart({ rows, month }: { rows: TrendRow[]; month: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const values = rows.map((r) => Number(r.profit_uzs))
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const shown = rows.find((r) => r.month === (hover ?? month)) ?? rows[rows.length - 1]
  if (values.every((v) => v === 0)) return <div className="py-6 text-center text-[13.5px] text-muted">Hali ma’lumot yo‘q: birinchi to‘lovdan keyin ko‘rinadi.</div>
  return (
    <>
      <div className="mb-3 min-h-[46px]">
        <div className="text-[12.5px] text-muted">{monthLabel(shown.month)}</div>
        <div className={`num font-display text-[20px] font-semibold ${Number(shown.profit_uzs) < 0 ? 'text-bad' : ''}`}>{round(shown.profit_uzs)}</div>
      </div>
      <div className="relative flex h-[150px] items-stretch gap-[3px] sm:gap-1.5" onPointerLeave={() => setHover(null)}>
        {rows.map((r) => {
          const value = Number(r.profit_uzs)
          const zero = (max / span) * 100
          const height = (Math.abs(value) / span) * 100
          const selected = r.month === shown.month
          return (
            <button key={r.month} type="button" aria-label={`${monthLabel(r.month)}: ${compact(value)} so‘m`} onPointerEnter={() => setHover(r.month)} onFocus={() => setHover(r.month)} onClick={() => setHover(r.month)} className="relative min-w-0 flex-1 rounded-md hover:bg-ivory">
              <span className={`absolute inset-x-[12%] ${value >= 0 ? 'rounded-t-[4px]' : 'rounded-b-[4px]'} ${value < 0 ? 'bg-bad' : selected ? 'bg-gold-deep' : 'bg-ink'}`}
                style={value >= 0 ? { bottom: `${100 - zero}%`, height: `${height}%`, minHeight: value ? 2 : 0 } : { top: `${zero}%`, height: `${height}%`, minHeight: 2 }} />
            </button>
          )
        })}
        <span className="pointer-events-none absolute inset-x-0 h-px bg-line-strong" style={{ top: `${(max / span) * 100}%` }} />
      </div>
      <div className="mt-1 flex gap-[3px] sm:gap-1.5">
        {rows.map((r, i) => <span key={r.month} className="num min-w-0 flex-1 text-center text-[9.5px] text-muted sm:text-[11px]">{i % 2 === 1 || rows.length < 7 ? r.month.slice(5) : ''}</span>)}
      </div>
    </>
  )
}

export function Report() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(monthKey())
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const data = useQuery({ queryKey: ['report', 'summary', month], queryFn: () => get<MonthSummary>('/finance/summary/', { month }) })
  const trend = useQuery({ queryKey: ['report', 'trend', month], queryFn: () => get<TrendRow[]>('/finance/trend/', { month }) })
  const clients = useQuery({ queryKey: ['report', 'clients', month], queryFn: () => get<ClientProfit[]>('/finance/by-client/', { month }) })
  const toggle = useMutation({
    mutationFn: (action: string) => post('/finance/close-month/', { month, action }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report'] }),
  })
  const s = data.data
  const receivable = Object.entries(s?.receivable ?? {}).map(([cur, value]) => money(value, cur)).join(' · ')
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        {s && (s.is_closed
          ? <><Badge tone="dark">Oy yopilgan</Badge>{user?.role === 'super_admin' && <Button variant="ghost" disabled={toggle.isPending} onClick={() => confirm('Oy qayta ochilsinmi? Hisobot raqamlari o‘zgarishi mumkin.') && toggle.mutate('reopen')}>Qayta ochish</Button>}</>
          : <Button variant="ghost" disabled={toggle.isPending} onClick={() => confirm('Oyni yopsangiz, undagi to‘lov va xarajatlarni faqat rahbar o‘zgartiradi. Yopilsinmi?') && toggle.mutate('close')}>Oyni yopish</Button>)}
        <Button variant="ghost" onClick={() => downloadFile('/finance/export/clients/', `mijozlar-foydasi-${month}.csv`, { month })}><Download size={15} />Mijozlar CSV</Button>
        <Button variant="ghost" onClick={() => downloadFile('/finance/export/payroll/', `vedomost-${month}.csv`, { month })}><Download size={15} />Vedomost CSV</Button>
      </div>
      <ErrorBox error={data.error || toggle.error} />
      {data.isLoading && <Spinner />}
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tushum" value={round(s.own_income_uzs)} hint={Number(s.transit_uzs) ? `+ tranzit ${round(s.transit_uzs)}` : 'Reklama budjetisiz'} />
            <Stat label="Jamoa ulushi" value={round(s.team_share_uzs)} hint={Number(s.team_adjustments_uzs) ? `Bonus va tuzatish: ${round(s.team_adjustments_uzs)}` : undefined} />
            <Stat label="Xarajatlar" value={round(s.expenses_uzs)} />
            <Stat label="Sof foyda" value={<span className={Number(s.profit_uzs) < 0 ? 'text-bad' : ''}>{round(s.profit_uzs)}</span>} hint={s.margin_percent !== null ? `Marja ${pct(s.margin_percent)}` : undefined} />
          </div>

          <Card className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Kicker>Sof foyda · 12 oy</Kicker>
              <Button variant="ghost" onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>{view === 'chart' ? 'Jadval' : 'Grafik'}</Button>
            </div>
            {trend.data && (view === 'chart' ? <TrendChart rows={trend.data} month={month} /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead><tr className="text-left text-muted"><th className="py-1.5 font-semibold">Oy</th><th className="font-semibold">Tushum</th><th className="font-semibold">Jamoa</th><th className="font-semibold">Xarajat</th><th className="font-semibold">Foyda</th></tr></thead>
                  <tbody>
                    {trend.data.map((r) => <tr key={r.month} className="border-t border-line-soft"><td className="py-1.5">{monthLabel(r.month)}</td><td className="num">{round(r.income_uzs)}</td><td className="num">{round(r.team_uzs)}</td><td className="num">{round(r.expenses_uzs)}</td><td className="num font-bold">{round(r.profit_uzs)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            ))}
          </Card>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <Kicker>Pul oqimi · {monthLabel(month)}</Kicker>
              <p className="mb-2 text-[12.5px] text-muted">Haqiqatda kirgan va chiqqan pul. Hisoblangan, lekin hali berilmagan maosh bu yerga kirmaydi.</p>
              <div className="text-[14px]">
                <Line label="Mijozlardan tushdi" value={round(s.cash.in_uzs)} />
                <Line label="Maosh to‘landi" value={minus(s.cash.payouts_uzs)} />
                <Line label="Avans berildi" value={minus(s.cash.advances_uzs)} />
                <Line label="Xarajatlar" value={minus(s.cash.expenses_uzs)} />
                <Line label="Sheriklar oldi" value={minus(s.cash.withdrawals_uzs)} />
                <Line label="Oy natijasi" value={round(s.cash.net_uzs)} strong />
              </div>
              <div className="mt-3 space-y-1 border-t border-line-soft pt-3 text-[13.5px]">
                <div className="flex justify-between gap-3"><span className="text-muted">Xodimlarga to‘lanmagan</span><b className="num">{round(s.payroll_unpaid_uzs)}</b></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Mijozlar qarzi (hammasi)</span><b className="num">{receivable || '—'}</b></div>
              </div>
            </Card>
            <Card>
              <Kicker>Sheriklar ulushi</Kicker>
              {s.partners.length === 0 && <div className="py-2 text-[13.5px] text-muted">Sheriklar kiritilmagan. «Sheriklar» bo‘limida ism va foizni yozing.</div>}
              <div className="divide-y divide-line-soft">
                {s.partners.map((p) => (
                  <div key={p.id} className="py-2.5">
                    <div className="flex justify-between gap-3 font-bold"><span>{p.name} · {pct(p.share_percent)}</span><span className="num">{round(p.share_uzs)}</span></div>
                    <div className="flex justify-between gap-3 text-[12.5px] text-muted"><span>Shu oy oldi</span><span className="num">{round(p.taken_uzs)}</span></div>
                  </div>
                ))}
              </div>
              <div className="mt-4"><Kicker>Xarajatlar kategoriya bo‘yicha</Kicker></div>
              {s.expenses_by_category.length === 0 && <div className="text-[13.5px] text-muted">Xarajat yo‘q</div>}
              {s.expenses_by_category.map((c) => <div key={c.category} className="flex justify-between gap-3 border-b border-line-soft py-1.5 text-[14px] last:border-0"><span>{c.category}</span><span className="num">{round(c.amount_uzs)}</span></div>)}
            </Card>
          </div>

          <div className="mt-4"><Kicker>Mijozlar bo‘yicha foyda</Kicker></div>
          {clients.data?.length === 0 ? <Card><Empty title="Bu oy harakat yo‘q" /></Card> : (
            <Table head={['Mijoz', 'Tushum', 'Jamoa', 'Xarajat', 'Foyda', 'Marja']}>
              {clients.data?.map((r) => (
                <tr key={r.client}>
                  <td className="font-semibold">{r.client}</td>
                  <td className="num">{round(r.income_uzs)}</td>
                  <td className="num">{round(r.team_uzs)}</td>
                  <td className="num">{round(r.expenses_uzs)}</td>
                  <td className={`num font-bold ${Number(r.profit_uzs) < 0 ? 'text-bad' : ''}`}>{round(r.profit_uzs)}</td>
                  <td className="num">{r.margin_percent !== null ? pct(r.margin_percent) : '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </>
  )
}
