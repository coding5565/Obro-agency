import { useQuery } from '@tanstack/react-query'
import { get } from '../../shared/api/client'
import { date, money } from '../../shared/lib/format'
import { Card, Empty, PageHeader, Spinner, StatusBadge } from '../../shared/ui'

interface PortalInvoice {
  id: number; number: string; period_start: string; period_end: string; currency: string; total: string; paid_amount: string
  outstanding: string; due_date: string; status: string; status_label: string; lines: { description: string; amount: string }[]
}

export function PortalInvoices() {
  const list = useQuery({ queryKey: ['portal', 'invoices'], queryFn: () => get<PortalInvoice[]>('/portal/invoices/') })
  const debt = list.data?.filter((i) => Number(i.outstanding) > 0) ?? []
  return (
    <>
      <PageHeader title="To‘lovlar" subtitle={debt.length ? `To‘lanmagan: ${debt.map((i) => money(i.outstanding, i.currency)).join(', ')}` : 'Qarz yo‘q — rahmat!'} />
      {list.isLoading && <Spinner />}
      {list.data?.length === 0 && <Card><Empty title="Hisob-faktura hali yo‘q" /></Card>}
      <div className="space-y-3">
        {list.data?.map((inv) => (
          <Card key={inv.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="num text-[12px] text-muted">{inv.number}</div>
                <div className="font-semibold">{date(inv.period_start)} – {date(inv.period_end)}</div>
              </div>
              <StatusBadge status={inv.status} label={inv.status_label} />
            </div>
            <div className="mt-2 space-y-0.5 text-[13px] text-muted">{inv.lines.map((l, i) => <div key={i}>{l.description}</div>)}</div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
              <span>Summa: <b className="num">{money(inv.total, inv.currency)}</b></span>
              <span>To‘langan: <b className="num">{money(inv.paid_amount, inv.currency)}</b></span>
              {Number(inv.outstanding) > 0 && <span>Muddat: <b className="num">{date(inv.due_date)}</b></span>}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
