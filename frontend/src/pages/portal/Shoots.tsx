import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../../shared/api/client'
import { date, today } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Kicker, PageHeader, Spinner, StatusBadge } from '../../shared/ui'

interface PortalShoot {
  id: number
  date: string
  start_time: string | null
  end_time: string | null
  location: string
  client_prep: string
  client_confirmed_at: string | null
  status: string
  status_label: string
}

const hm = (value: string | null) => value?.slice(0, 5) ?? ''

export function PortalShoots() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['portal', 'shoots'], queryFn: () => get<PortalShoot[]>('/portal/shoots/') })
  const confirm = useMutation({
    mutationFn: (id: number) => post(`/portal/shoots/${id}/confirm/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal', 'shoots'] }),
  })
  const now = today()
  const rows = list.data ?? []
  const upcoming = rows.filter((s) => s.status === 'planned' && s.date >= now)
  const past = rows.filter((s) => !(s.status === 'planned' && s.date >= now)).reverse()
  return (
    <>
      <PageHeader title="Syomka kunlari" subtitle="Qachon kelamiz va nimani tayyorlab qo‘yasiz" />
      <ErrorBox error={list.error ?? confirm.error} />
      {list.isLoading ? <Spinner /> : upcoming.length === 0 ? <Empty title="Rejada syomka yo‘q" hint="Syomka belgilanganda xabar olasiz." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {upcoming.map((s) => (
            <Card key={s.id}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="num font-display text-[18px] font-semibold">{date(s.date)} {hm(s.start_time)}{s.end_time && `–${hm(s.end_time)}`}</span>
                {s.client_confirmed_at ? <Badge tone="ok" dot>Tasdiqlangan</Badge> : <Badge tone="warn" dot>Tasdiq kutilmoqda</Badge>}
              </div>
              {s.location && <div className="text-[13.5px]">{s.location}</div>}
              {s.client_prep && <div className="mt-3 rounded-xl bg-ivory p-3"><Kicker>Tayyorlab qo‘ying</Kicker><div className="whitespace-pre-wrap">{s.client_prep}</div></div>}
              {!s.client_confirmed_at && <Button className="mt-3" disabled={confirm.isPending} onClick={() => confirm.mutate(s.id)}>Tasdiqlayman</Button>}
            </Card>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <div className="mt-6">
          <Kicker>O‘tgan va bekor qilingan</Kicker>
          <div className="space-y-1">
            {past.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-2 text-[13.5px]"><span className="num">{date(s.date)}</span>{s.location && <span className="text-muted">{s.location}</span>}<StatusBadge status={s.status} label={s.status_label} /></div>)}
          </div>
        </div>
      )}
    </>
  )
}
