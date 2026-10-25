import { useQuery } from '@tanstack/react-query'
import { get } from '../../shared/api/client'
import { date } from '../../shared/lib/format'
import { Badge, Card, Empty, Kicker, PageHeader, Spinner } from '../../shared/ui'

interface Entry { date: string; time: string; kind_label: string; title: string; quantity: number; link: string }

export function PortalWorklog() {
  const list = useQuery({ queryKey: ['portal', 'worklog'], queryFn: () => get<Entry[]>('/portal/worklog/', { days: 30 }) })
  const byDate = new Map<string, Entry[]>()
  list.data?.forEach((e) => byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]))
  return (
    <>
      <PageHeader title="Bugun nima qilindi" subtitle="So‘nggi 30 kunda jamoa bajargan ishlar. SMM menejer tekshirgan yozuvlar ko‘rinadi." />
      {list.isLoading && <Spinner />}
      {list.data?.length === 0 && <Card><Empty title="Hali yozuv yo‘q" /></Card>}
      <div className="space-y-4">
        {[...byDate.entries()].map(([day, entries]) => (
          <Card key={day}>
            <Kicker>{date(day)}</Kicker>
            {entries.map((e, i) => (
              <div key={i} className="flex gap-3 border-b border-dashed border-line py-2 last:border-0">
                <span className="num w-11 shrink-0 text-muted">{e.time}</span>
                <span className="min-w-0 flex-1"><Badge tone="draft">{e.kind_label}</Badge> {e.title}{e.quantity > 1 && <span className="num text-muted"> ×{e.quantity}</span>}</span>
                {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-bronze">havola</a>}
              </div>
            ))}
          </Card>
        ))}
      </div>
    </>
  )
}
