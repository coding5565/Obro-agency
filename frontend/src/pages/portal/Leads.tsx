import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Phone } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { get, patch } from '../../shared/api/client'
import { dateTime, money, pct } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Input, Kicker, Modal, PageHeader, Select, Spinner, Stat } from '../../shared/ui'
import { EventList, LEAD_STATUS, LEAD_TONE } from '../team/Leads'
import type { LeadEvent, LeadStats } from '../team/Leads'

interface PortalLead {
  id: number
  full_name: string
  phone: string
  email: string
  city: string
  message: string
  form_name: string
  campaign_name: string
  source_label: string
  status: string
  status_label: string
  is_duplicate: boolean
  next_contact_at: string | null
  sale_amount: string | null
  sale_currency: string
  lost_reason: string
  created_at: string
  events: LeadEvent[]
}

const CHOICES = LEAD_STATUS.filter(([key]) => key !== 'spam')

export function PortalLeads() {
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const list = useQuery({
    queryKey: ['portal', 'leads', status],
    queryFn: () => get<{ results: PortalLead[]; stats: LeadStats | null }>('/portal/leads/', { status }),
    refetchInterval: 30_000,
  })
  const openId = Number(params.get('lead'))
  const open = list.data?.results.find((l) => l.id === openId)
  const s = list.data?.stats
  return (
    <>
      <PageHeader title="Lidlar" subtitle="Reklamangizdan kelgan murojaatlar. Tezroq qo‘ng‘iroq qilsangiz, sotuv ko‘payadi." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bugun" value={s?.today ?? '—'} hint={`Haftada ${s?.week ?? 0} ta`} />
        <Stat label="Javob kutmoqda" value={s?.unanswered ?? '—'} />
        <Stat label="Sotildi" value={s?.won ?? '—'} hint={Object.entries(s?.sales ?? {}).map(([c, v]) => money(Math.round(Number(v)), c)).join(' · ') || undefined} />
        <Stat label="Konversiya" value={s ? pct(s.conversion_percent) : '—'} />
      </div>
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="mb-4 max-w-[180px]" aria-label="Holat">
        <option value="">Barcha holatlar</option>
        {CHOICES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select>
      <ErrorBox error={list.error} />
      {list.isLoading ? <Spinner /> : list.data?.results.length === 0 ? <Empty title="Hozircha lid yo‘q" hint="Reklamadan murojaat kelishi bilan shu yerda ko‘rinadi." /> : (
        <div className="space-y-2">
          {list.data?.results.map((l) => (
            <Card key={l.id}>
              <button className="block w-full text-left" onClick={() => setParams({ lead: String(l.id) }, { replace: true })}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{l.full_name || 'Ismsiz'}</span>
                  <Badge tone={LEAD_TONE[l.status]} dot>{l.status_label}</Badge>
                </div>
                <div className="num text-[13px]">{l.phone || 'telefon yo‘q'}</div>
                <div className="text-[12.5px] text-muted">{l.form_name || l.source_label} · {dateTime(l.created_at)}</div>
              </button>
            </Card>
          ))}
        </div>
      )}
      {open && <LeadModal lead={open} onClose={() => setParams({}, { replace: true })} />}
    </>
  )
}

function LeadModal({ lead: l, onClose }: { lead: PortalLead; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<'lost' | 'won' | null>(null)
  const [reason, setReason] = useState('')
  const [sale, setSale] = useState('')
  const [comment, setComment] = useState('')
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch(`/portal/leads/${l.id}/`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'leads'] })
      setPending(null)
      setComment('')
    },
  })
  const choose = (status: string) => {
    if (status === 'lost' || status === 'won') setPending(status)
    else update.mutate({ status })
  }
  return (
    <Modal title={l.full_name || 'Ismsiz lid'} onClose={onClose}>
      <div className="space-y-4">
        {l.phone && <a href={`tel:${l.phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-ink px-4 font-bold text-ivory"><Phone size={15} />{l.phone}</a>}
        <div className="text-[13px] text-muted">{[l.form_name, l.campaign_name, l.city, l.email].filter(Boolean).join(' · ')}</div>
        {l.is_duplicate && <Badge tone="warn">Avval ham murojaat qilgan</Badge>}
        {l.message && <div className="rounded-xl bg-ivory p-3 text-[13.5px] whitespace-pre-wrap">{l.message}</div>}
        <ErrorBox error={update.error} />
        <div>
          <Kicker>Natija</Kicker>
          <div className="flex flex-wrap gap-1.5">
            {CHOICES.filter(([key]) => key !== l.status).map(([key, label]) => (
              <Button key={key} variant="ghost" disabled={update.isPending} onClick={() => choose(key)}>{label}</Button>
            ))}
          </div>
          {pending === 'lost' && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ status: 'lost', lost_reason: reason }) }}>
              <Input placeholder="Nega rad etdi?" value={reason} onChange={(e) => setReason(e.target.value)} required aria-label="Rad etish sababi" />
              <Button>Saqlash</Button>
            </form>
          )}
          {pending === 'won' && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ status: 'won', sale_amount: sale }) }}>
              <Input type="number" min="0" placeholder="Sotuv summasi, so‘m (ixtiyoriy)" value={sale} onChange={(e) => setSale(e.target.value)} aria-label="Sotuv summasi" />
              <Button>Saqlash</Button>
            </form>
          )}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ comment }) }}>
          <Input placeholder="Izoh yozing…" value={comment} onChange={(e) => setComment(e.target.value)} required aria-label="Izoh" />
          <Button variant="ghost" disabled={update.isPending}>Yozish</Button>
        </form>
        <EventList events={l.events} />
      </div>
    </Modal>
  )
}
