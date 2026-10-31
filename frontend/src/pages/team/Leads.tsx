import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, Download, FlaskConical, Pause, Phone, Play, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, get, patch, post } from '../../shared/api/client'
import type { Page } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { dateTime, money, pct } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, Stat, Table, Tabs, Textarea } from '../../shared/ui'
import type { Tone } from '../../shared/ui'
import { useActiveProjects } from './Content'

export interface LeadEvent { id: number; kind: string; text: string; user_name?: string; created_at: string }

interface Lead {
  id: number
  project: number
  client_name: string
  source_label: string
  full_name: string
  phone: string
  email: string
  city: string
  message: string
  form_name: string
  campaign_name: string
  ad_name: string
  status: string
  status_label: string
  assigned_to: number | null
  assigned_to_name: string
  is_duplicate: boolean
  response_minutes: number | null
  next_contact_at: string | null
  sale_amount: string | null
  sale_currency: string
  lost_reason: string
  created_at: string
  events?: LeadEvent[]
  raw?: unknown
}

interface LeadSource {
  id: number
  project: number
  client_name: string
  name: string
  kind: string
  kind_label: string
  is_active: boolean
  telegram_chat_id: number | null
  received_count: number
  last_received_at: string | null
  webhook_url: string
}

export interface LeadStats { total: number; contacted: number; won: number; conversion_percent: number; today: number; week: number; unanswered: number; sales: Record<string, string> }

export const LEAD_STATUS: [string, string][] = [['new', 'Yangi'], ['contacted', 'Bog‘lanildi'], ['qualified', 'Qiziqdi'], ['won', 'Sotildi'], ['lost', 'Rad etdi'], ['spam', 'Spam']]
export const LEAD_TONE: Record<string, Tone> = { new: 'bad', contacted: 'info', qualified: 'warn', won: 'ok', lost: 'draft', spam: 'draft' }
const BOARD = LEAD_STATUS.slice(0, 5)
const KINDS: [string, string][] = [['yuboraman', 'Yuboraman.uz'], ['meta', 'Facebook / Instagram forma'], ['tilda', 'Tilda / sayt formasi'], ['telegram', 'Telegram bot'], ['other', 'Boshqa tizim']]

const GUIDE: Record<string, string> = {
  yuboraman: 'Yuboraman.uz’da formani tanlang, qabul qiluvchilar qatoriga «o‘z API manzilingiz»ni qo‘shing va shu manzilni kiriting. Birinchi lid kelgach, shu yerda paydo bo‘ladi.',
  meta: 'Facebook to‘g‘ridan-to‘g‘ri ulash uchun Meta ilovasi va HTTPS kerak. Tezroq yo‘l: Yuboraman yoki Zapier orqali shu manzilga yuboring.',
  tilda: 'Tilda: Site settings → Forms → Webhook bo‘limiga shu manzilni kiriting. Boshqa saytlarda forma yuboriladigan manzil sifatida qo‘ying.',
  telegram: 'Telegram botingiz lidni shu manzilga JSON ko‘rinishida yuborsin: name, phone, message.',
  other: 'Tizim lidni shu manzilga POST qilib yuborsin (JSON yoki forma). name va phone maydonlari o‘zi taniladi.',
}

export function LeadsPage() {
  const { can } = useAuth()
  const [tab, setTab] = useState<'leads' | 'sources'>('leads')
  return (
    <>
      <PageHeader title="Lidlar" subtitle="Reklamadan kelgan murojaatlar shu yerga o‘zi tushadi" />
      {can('leads.manage') && <Tabs value={tab} onChange={setTab} items={[['leads', 'Lidlar'], ['sources', 'Manbalar']]} />}
      {tab === 'leads' ? <LeadList /> : <Sources />}
    </>
  )
}

function LeadList() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const projects = useActiveProjects()
  const [project, setProject] = useState('')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'table' | 'board'>('table')
  const [creating, setCreating] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
  const openId = params.get('lead')
  const list = useQuery({
    queryKey: ['leads', project, status, search],
    queryFn: () => get<Page<Lead>>('/leads/items/', { project, status, search, page_size: 300 }),
    refetchInterval: 30_000,
  })
  const stats = useQuery({
    queryKey: ['leads', 'stats', project],
    queryFn: () => get<LeadStats>('/leads/items/stats/', { project }),
    refetchInterval: 30_000,
  })
  const open = (id: number | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('lead', String(id))
    else next.delete('lead')
    setParams(next, { replace: true })
  }
  const download = async () => {
    setExportError(null)
    try {
      const text = await api<string>('/leads/items/export/', { params: { project, status, search } })
      const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'lidlar.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error)
    }
  }
  const rows = list.data?.results ?? []
  const s = stats.data
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bugun" value={s?.today ?? '—'} hint={`Haftada ${s?.week ?? 0} ta`} />
        <Stat label="Javob kutmoqda" value={s?.unanswered ?? '—'} hint={s?.unanswered ? <span className="text-bad">Tezroq bog‘laning</span> : 'Hammasiga javob berilgan'} />
        <Stat label="Sotildi" value={s?.won ?? '—'} hint={Object.entries(s?.sales ?? {}).map(([c, v]) => money(Math.round(Number(v)), c)).join(' · ') || `${s?.total ?? 0} ta liddan`} />
        <Stat label="Konversiya" value={s ? pct(s.conversion_percent) : '—'} hint="Lid → sotuv" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={project} onChange={(e) => setProject(e.target.value)} className="max-w-xs" aria-label="Loyiha">
          <option value="">Barcha mijozlar</option>
          {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[170px]" aria-label="Holat">
          <option value="">Barcha holatlar</option>
          {LEAD_STATUS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
        <Input placeholder="Ism yoki telefon…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-[220px]" aria-label="Qidirish" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={download}><Download size={15} />CSV</Button>
          {can('leads.manage') && <Button onClick={() => setCreating(true)}><Plus size={16} />Lid qo‘shish</Button>}
        </div>
      </div>
      <Tabs value={view} onChange={setView} items={[['table', 'Ro‘yxat'], ['board', 'Voronka']]} />
      <ErrorBox error={list.error ?? exportError} />
      {list.isLoading ? <Spinner /> : rows.length === 0 ? (
        <Empty title="Hozircha lid yo‘q" hint="«Manbalar» bo‘limida manzil oling va Yuboraman yoki saytga ulang." />
      ) : view === 'table' ? (
        <Table head={['Lid', 'Mijoz', 'Manba', 'Mas’ul', 'Keldi', 'Holat']}>
          {rows.map((l) => (
            <tr key={l.id} className="cursor-pointer hover:bg-ivory/60" onClick={() => open(l.id)}>
              <td>
                <div className="font-semibold">{l.full_name || 'Ismsiz'} {l.is_duplicate && <Badge tone="warn">Takror</Badge>}</div>
                <div className="num text-[12.5px] text-muted">{l.phone || 'telefon yo‘q'}</div>
              </td>
              <td>{l.client_name}</td>
              <td><div>{l.form_name || l.source_label}</div>{l.campaign_name && <div className="text-[12px] text-muted">{l.campaign_name}</div>}</td>
              <td>{l.assigned_to_name || <span className="text-muted">—</span>}</td>
              <td className="num whitespace-nowrap">{dateTime(l.created_at)}</td>
              <td><Badge tone={LEAD_TONE[l.status]} dot>{l.status_label}</Badge></td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5">
          {BOARD.map(([key, label]) => {
            const cards = rows.filter((l) => l.status === key)
            return (
              <div key={key} className="min-w-[200px] rounded-2xl bg-ivory/70 p-2">
                <div className="mb-2 flex items-center justify-between px-1"><Badge tone={LEAD_TONE[key]} dot>{label}</Badge><span className="num text-[12px] text-muted">{cards.length}</span></div>
                <div className="space-y-2">
                  {cards.map((l) => (
                    <button key={l.id} onClick={() => open(l.id)} className="w-full rounded-xl border border-line-soft bg-white p-3 text-left shadow-card">
                      <div className="truncate font-semibold">{l.full_name || 'Ismsiz'}</div>
                      <div className="num text-[12px] text-muted">{l.phone}</div>
                      <div className="mt-1 truncate text-[12px] text-muted">{l.client_name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {openId && <LeadModal id={Number(openId)} onClose={() => open(null)} />}
      {creating && <CreateLead onClose={() => setCreating(false)} />}
    </>
  )
}

function toLocalInput(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function LeadModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => get<Lead>(`/leads/items/${id}/`) })
  const projects = useActiveProjects()
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const [sale, setSale] = useState('')
  const [next, setNext] = useState('')
  const [pending, setPending] = useState<'lost' | 'won' | null>(null)
  useEffect(() => { setNext(toLocalInput(lead.data?.next_contact_at ?? null)) }, [lead.data?.next_contact_at])
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => post(`/leads/items/${id}/${path}/`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setPending(null)
      setText('')
    },
  })
  const l = lead.data
  const manage = can('leads.manage')
  const team = projects.data?.results.find((p) => p.id === l?.project)?.assignments ?? []
  const choose = (status: string) => {
    if (status === 'lost' || status === 'won') setPending(status)
    else act.mutate({ path: 'set-status', body: { status } })
  }
  return (
    <Modal title={l ? (l.full_name || 'Ismsiz lid') : 'Lid'} onClose={onClose} wide>
      {!l ? <Spinner /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={LEAD_TONE[l.status]} dot>{l.status_label}</Badge>
            {l.is_duplicate && <Badge tone="warn">Avval ham murojaat qilgan</Badge>}
            <span className="text-[12.5px] text-muted">{l.client_name} · {dateTime(l.created_at)}</span>
            {l.response_minutes !== null && <span className="text-[12.5px] text-muted">· javob {l.response_minutes} daqiqada</span>}
          </div>
          {l.phone && <a href={`tel:${l.phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-ink px-4 font-bold text-ivory"><Phone size={15} />{l.phone}</a>}
          <dl className="grid gap-x-4 gap-y-1 text-[13.5px] sm:grid-cols-2">
            {([['Email', l.email], ['Shahar', l.city], ['Forma', l.form_name], ['Kampaniya', l.campaign_name], ['Reklama', l.ad_name], ['Manba', l.source_label]] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt className="text-muted">{k}:</dt><dd className="min-w-0 break-words font-semibold">{v}</dd></div>
            ))}
          </dl>
          {l.message && <div className="rounded-xl bg-ivory p-3 text-[13.5px] whitespace-pre-wrap">{l.message}</div>}
          {!l.full_name && !l.phone && <div className="flex items-center gap-2 rounded-xl bg-warn/10 p-3 text-[13px]"><AlertTriangle size={15} />Ism va telefon tanilmadi. Pastdagi xom ma’lumotni tekshiring.</div>}
          <ErrorBox error={act.error} />
          {manage && (
            <>
              <div>
                <Kicker>Holatni o‘zgartirish</Kicker>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUS.filter(([key]) => key !== l.status).map(([key, label]) => (
                    <Button key={key} variant="ghost" disabled={act.isPending} onClick={() => choose(key)}>{label}</Button>
                  ))}
                </div>
                {pending === 'lost' && (
                  <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); act.mutate({ path: 'set-status', body: { status: 'lost', lost_reason: reason } }) }}>
                    <Input placeholder="Nega rad etdi?" value={reason} onChange={(e) => setReason(e.target.value)} required aria-label="Rad etish sababi" />
                    <Button>Saqlash</Button>
                  </form>
                )}
                {pending === 'won' && (
                  <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); act.mutate({ path: 'set-status', body: { status: 'won', sale_amount: sale } }) }}>
                    <Input type="number" min="0" placeholder="Sotuv summasi, so‘m (ixtiyoriy)" value={sale} onChange={(e) => setSale(e.target.value)} aria-label="Sotuv summasi" />
                    <Button>Saqlash</Button>
                  </form>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mas’ul">
                  <Select value={l.assigned_to ?? ''} onChange={(e) => act.mutate({ path: 'assign', body: { assigned_to: e.target.value || null } })}>
                    <option value="">Belgilanmagan</option>
                    {l.assigned_to && !team.some((a) => a.user === l.assigned_to) && <option value={l.assigned_to}>{l.assigned_to_name}</option>}
                    {team.map((a) => <option key={a.id} value={a.user}>{a.user_name}</option>)}
                  </Select>
                </Field>
                <Field label="Qayta bog‘lanish" hint="Vaqti kelganda mas’ulga eslatma boradi">
                  <div className="flex gap-2">
                    <Input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} />
                    <Button type="button" variant="ghost" onClick={() => act.mutate({ path: 'schedule', body: { next_contact_at: next ? new Date(next).toISOString() : null } })} aria-label="Eslatmani saqlash"><Check size={15} /></Button>
                  </div>
                </Field>
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act.mutate({ path: 'comment', body: { text } }) }}>
                <Input placeholder="Izoh: nima gaplashildi…" value={text} onChange={(e) => setText(e.target.value)} required aria-label="Izoh" />
                <Button variant="ghost" disabled={act.isPending}>Yozish</Button>
              </form>
            </>
          )}
          <EventList events={l.events ?? []} />
          {l.raw && Object.keys(l.raw as object).length > 0 ? (
            <details className="text-[12.5px]">
              <summary className="cursor-pointer font-semibold text-bronze">Xom ma’lumot</summary>
              <pre className="mt-2 max-h-52 overflow-auto rounded-xl bg-ivory p-3">{JSON.stringify(l.raw, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      )}
    </Modal>
  )
}

export function EventList({ events }: { events: LeadEvent[] }) {
  if (events.length === 0) return null
  return (
    <div>
      <Kicker>Tarix</Kicker>
      <div className="space-y-1.5 text-[13px]">
        {events.map((e) => (
          <div key={e.id} className="flex flex-wrap gap-x-2">
            <span className="num text-muted">{dateTime(e.created_at)}</span>
            <span className="min-w-0 break-words">{e.text}</span>
            {e.user_name && <span className="text-muted">— {e.user_name}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateLead({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const projects = useActiveProjects()
  const [form, setForm] = useState({ project: '', full_name: '', phone: '', message: '', form_name: '' })
  const create = useMutation({
    mutationFn: () => post('/leads/items/', { ...form, project: Number(form.project) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leads'] }); onClose() },
  })
  return (
    <Modal title="Lid qo‘shish" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <Field label="Mijoz">
          <Select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} required>
            <option value="">Tanlang…</option>
            {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
          </Select>
        </Field>
        <Field label="Ism"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="Telefon"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" /></Field>
        <Field label="Qayerdan keldi"><Input value={form.form_name} onChange={(e) => setForm({ ...form, form_name: e.target.value })} placeholder="Masalan: Direct, qo‘ng‘iroq" /></Field>
        <Field label="Izoh"><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
        <ErrorBox error={create.error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Bekor</Button><Button disabled={create.isPending}>Saqlash</Button></div>
      </form>
    </Modal>
  )
}

function Sources() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['lead-sources'], queryFn: () => get<Page<LeadSource>>('/leads/sources/', { page_size: 100 }) })
  const [creating, setCreating] = useState(false)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-sources'] })
    queryClient.invalidateQueries({ queryKey: ['leads'] })
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setCreating(true)}><Plus size={16} />Manba qo‘shish</Button></div>
      <ErrorBox error={list.error} />
      {list.isLoading ? <Spinner /> : list.data?.results.length === 0 ? (
        <Empty title="Manba yo‘q" hint="Har bir forma yoki sayt uchun alohida manba oching. U alohida maxfiy manzil beradi." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data?.results.map((s) => <SourceCard key={s.id} source={s} onChange={refresh} />)}
        </div>
      )}
      {creating && <CreateSource onClose={() => setCreating(false)} onDone={refresh} />}
    </>
  )
}

function SourceCard({ source: s, onChange }: { source: LeadSource; onChange: () => void }) {
  const [copied, setCopied] = useState(false)
  const [chat, setChat] = useState(s.telegram_chat_id ? String(s.telegram_chat_id) : '')
  const update = useMutation({ mutationFn: (body: Partial<LeadSource>) => patch(`/leads/sources/${s.id}/`, body), onSuccess: onChange })
  const test = useMutation({ mutationFn: () => post(`/leads/sources/${s.id}/test/`), onSuccess: onChange })
  const copy = async () => {
    await navigator.clipboard.writeText(s.webhook_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">{s.name}</div>
          <div className="text-[12.5px] text-muted">{s.client_name} · {s.kind_label}</div>
        </div>
        <Badge tone={s.is_active ? 'ok' : 'draft'} dot>{s.is_active ? 'Ishlayapti' : 'To‘xtatilgan'}</Badge>
      </div>
      <div className="mb-2 text-[12.5px] text-muted">Qabul qilindi: <b className="num text-ink">{s.received_count}</b>{s.last_received_at && <> · oxirgisi {dateTime(s.last_received_at)}</>}</div>
      <Kicker>Manzil (webhook)</Kicker>
      <div className="mb-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-ivory px-2.5 py-2 text-[12px]">{s.webhook_url}</code>
        <Button variant="ghost" onClick={copy} aria-label="Manzilni nusxalash">{copied ? <Check size={15} /> : <Copy size={15} />}</Button>
      </div>
      {s.webhook_url.startsWith('http://') && <div className="mb-2 flex gap-2 rounded-xl bg-warn/10 p-2.5 text-[12.5px]"><AlertTriangle size={15} className="shrink-0" />Manzil HTTPS emas. Ayrim tizimlar uni qabul qilmasligi mumkin, buning uchun panelga domen ulash kerak.</div>}
      <p className="mb-3 text-[12.5px] leading-snug text-muted">{GUIDE[s.kind]}</p>
      <Field label="Telegram guruh raqami" hint="Lidlar guruhga ham tushsin desangiz: botni guruhga qo‘shing va /id yozing.">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ telegram_chat_id: chat ? Number(chat) : null }) }}>
          <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="-1001234567890" />
          <Button variant="ghost" disabled={update.isPending}>Saqlash</Button>
        </form>
      </Field>
      <ErrorBox error={update.error ?? test.error} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" disabled={test.isPending} onClick={() => test.mutate()}><FlaskConical size={15} />Sinov lidi</Button>
        <Button variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ is_active: !s.is_active })}>
          {s.is_active ? <><Pause size={15} />To‘xtatish</> : <><Play size={15} />Yoqish</>}
        </Button>
        {test.isSuccess && <span className="self-center text-[12.5px] font-semibold text-ok">Sinov lidi tushdi (hisobotga kirmaydi)</span>}
      </div>
    </Card>
  )
}

function CreateSource({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const projects = useActiveProjects()
  const [form, setForm] = useState({ project: '', name: '', kind: 'yuboraman' })
  const create = useMutation({
    mutationFn: () => post('/leads/sources/', { ...form, project: Number(form.project) }),
    onSuccess: () => { onDone(); onClose() },
  })
  return (
    <Modal title="Yangi manba" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <Field label="Mijoz">
          <Select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} required>
            <option value="">Tanlang…</option>
            {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
          </Select>
        </Field>
        <Field label="Nomi"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Masalan: Instagram forma — aksiya" required /></Field>
        <Field label="Qayerdan keladi">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </Field>
        <ErrorBox error={create.error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Bekor</Button><Button disabled={create.isPending}>Yaratish</Button></div>
      </form>
    </Modal>
  )
}
