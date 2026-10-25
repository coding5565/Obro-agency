import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { get } from '../../shared/api/client'
import { date, monthKey } from '../../shared/lib/format'
import { Card, Empty, PageHeader, Spinner, StatusBadge } from '../../shared/ui'
import { MonthPicker } from '../team/Payroll'

interface Item { id: number; kind_label: string; title: string; planned_date: string; status: string; status_label: string; published_url: string }

export function PortalCalendar() {
  const [month, setMonth] = useState(monthKey())
  const items = useQuery({ queryKey: ['portal', 'calendar', month], queryFn: () => get<Item[]>('/portal/calendar/', { month }) })
  return (
    <>
      <PageHeader title="Kontent kalendari" actions={<MonthPicker month={month} onChange={setMonth} />} />
      {items.isLoading && <Spinner />}
      {items.data?.length === 0 && <Card><Empty title="Bu oy uchun reja hali kiritilmagan" /></Card>}
      <div className="space-y-2">
        {items.data?.map((it) => (
          <Card key={it.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="num w-24 shrink-0 text-[12.5px] text-muted">{date(it.planned_date)}</div>
            <div className="min-w-0 flex-1"><span className="font-semibold">{it.kind_label}:</span> {it.title}</div>
            <StatusBadge status={it.status} label={it.status_label} />
            {it.status === 'awaiting_you' && <Link to={`/portal/approvals/${it.id}`} className="font-semibold text-bronze">Ko‘rish →</Link>}
            {it.published_url && <a href={it.published_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-bronze">Ochish <ExternalLink size={13} /></a>}
          </Card>
        ))}
      </div>
    </>
  )
}
