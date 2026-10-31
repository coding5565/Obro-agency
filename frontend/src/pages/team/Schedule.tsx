import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { get, patch, post } from '../../shared/api/client'
import type { Page } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, monthKey, monthLabel, shiftMonth, today } from '../../shared/lib/format'
import { Badge, Button, Card, cn, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea } from '../../shared/ui'
import { useActiveProjects } from './Content'

interface Conflict { shoot: number; client: string; when: string; people: string[] }

interface Shoot {
  id: number
  project: number
  client_name: string
  date: string
  start_time: string | null
  end_time: string | null
  location: string
  participants: number[]
  participant_names: string[]
  notes: string
  client_prep: string
  client_confirmed_at: string | null
  status: string
  status_label: string
  conflicts: Conflict[]
  open_briefs: number
}

interface BriefRow { id: number; title: string; client_name: string; deadline: string | null; status: string; assignee_name: string }

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const hm = (value: string | null) => value?.slice(0, 5) ?? ''

function monthCells(key: string) {
  const [y, m] = key.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const days = new Date(y, m, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m)}-${pad(d)}`)
  return { cells, first: `${y}-${pad(m)}-01`, last: `${y}-${pad(m)}-${pad(days)}` }
}

export function SchedulePage() {
  const { can } = useAuth()
  const manage = can('content.manage')
  const [month, setMonth] = useState(monthKey())
  const [creating, setCreating] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const { cells, first, last } = useMemo(() => monthCells(month), [month])
  const shoots = useQuery({
    queryKey: ['shoots', first],
    queryFn: () => get<Page<Shoot>>('/content/shoot-days/', { from: first, to: last, page_size: 200 }),
  })
  // Yaqin syomkalar oy chegarasiga bog'liq emas: 31-kuni ertangi syomka ham ko'rinadi.
  const soon = useQuery({
    queryKey: ['shoots', 'soon'],
    queryFn: () => get<Page<Shoot>>('/content/shoot-days/', { from: today(), status: 'planned', page_size: 8 }),
  })
  const briefs = useQuery({ queryKey: ['briefs'], queryFn: () => get<Page<BriefRow>>('/content/briefs/', { page_size: 300 }) })
  const rows = (shoots.data?.results ?? []).filter((s) => s.status !== 'cancelled')
  const deadlines = (briefs.data?.results ?? []).filter((b) => b.deadline && !['done', 'cancelled', 'draft'].includes(b.status))
  const now = today()
  const upcoming = soon.data?.results ?? []
  const open = [...(shoots.data?.results ?? []), ...upcoming].find((s) => s.id === openId)
  return (
    <>
      <PageHeader title="Syomka kalendari" subtitle="Syomkalar va TZ muddatlari bitta joyda"
        actions={manage && <Button onClick={() => setCreating(now)}><Plus size={16} />Syomka</Button>} />
      <div className="mb-4 flex items-center rounded-lg border border-line bg-white w-fit">
        <button className="p-2" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Oldingi oy"><ChevronLeft size={16} /></button>
        <span className="min-w-[130px] text-center font-semibold">{monthLabel(month)}</span>
        <button className="p-2" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Keyingi oy"><ChevronRight size={16} /></button>
      </div>
      <ErrorBox error={shoots.error} />
      {shoots.isLoading ? <Spinner /> : (
        <div className="grid gap-4 xl:grid-cols-4">
          <div className="overflow-x-auto rounded-2xl border border-line-soft bg-white p-2 shadow-card xl:col-span-3">
            <div className="grid min-w-[640px] grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => <div key={d} className="mono py-1 text-center text-[10.5px] text-muted uppercase">{d}</div>)}
              {cells.map((day, i) => (
                <div key={day ?? `pad-${i}`} className={cn('min-h-[92px] rounded-lg p-1.5', day ? 'bg-ivory/60' : '', day === now && 'ring-2 ring-gold')}>
                  {day && (
                    <>
                      <button disabled={!manage} onClick={() => setCreating(day)} aria-label={`${date(day)} kuniga syomka qo‘shish`}
                        className="num mb-1 block text-[12px] font-bold enabled:hover:text-bronze">{Number(day.slice(8))}</button>
                      <div className="space-y-1">
                        {rows.filter((s) => s.date === day).map((s) => (
                          <button key={s.id} onClick={() => setOpenId(s.id)} className={cn('block w-full truncate rounded px-1.5 py-1 text-left text-[11.5px] font-semibold',
                            s.status === 'done' ? 'bg-ok/15 text-ok' : s.conflicts.length ? 'bg-bad/15 text-bad' : 'bg-ink text-ivory')}>
                            {hm(s.start_time)} {s.client_name}
                          </button>
                        ))}
                        {deadlines.filter((b) => b.deadline?.slice(0, 10) === day).map((b) => (
                          <Link key={b.id} to={`/app/briefs/${b.id}`} className="block truncate rounded bg-gold/25 px-1.5 py-1 text-[11.5px] font-semibold">TZ: {b.title}</Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <Card className="h-fit">
            <Kicker>Yaqin syomkalar</Kicker>
            {upcoming.length === 0 && <div className="py-3 text-[13px] text-muted">Rejada syomka yo‘q.</div>}
            <div className="divide-y divide-line-soft">
              {upcoming.map((s) => (
                <button key={s.id} onClick={() => setOpenId(s.id)} className="block w-full py-2 text-left">
                  <div className="font-semibold">{s.client_name}</div>
                  <div className="num text-[12.5px] text-muted">{date(s.date)} {hm(s.start_time)}{s.location && ` · ${s.location}`}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.client_confirmed_at ? <Badge tone="ok">Mijoz tasdiqladi</Badge> : <Badge tone="warn">Mijoz tasdiqlamagan</Badge>}
                    {s.conflicts.length > 0 && <Badge tone="bad">Bandlik to‘qnashuvi</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
      {creating && <ShootForm day={creating} onClose={() => setCreating(null)} />}
      {open && <ShootModal shoot={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

function ShootForm({ day, shoot, onClose }: { day?: string; shoot?: Shoot; onClose: () => void }) {
  const queryClient = useQueryClient()
  const projects = useActiveProjects()
  const [form, setForm] = useState({
    project: shoot ? String(shoot.project) : '',
    date: shoot?.date ?? day ?? today(),
    start_time: hm(shoot?.start_time ?? null),
    end_time: hm(shoot?.end_time ?? null),
    location: shoot?.location ?? '',
    client_prep: shoot?.client_prep ?? '',
    notes: shoot?.notes ?? '',
  })
  const [people, setPeople] = useState<number[]>(shoot?.participants ?? [])
  const [warning, setWarning] = useState<Conflict[]>([])
  const project = projects.data?.results.find((p) => String(p.id) === form.project)
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, project: Number(form.project), participants: people, start_time: form.start_time || null, end_time: form.end_time || null }
      return shoot ? patch<Shoot>(`/content/shoot-days/${shoot.id}/`, body) : post<Shoot>('/content/shoot-days/', body)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['shoots'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      // To'qnashuv taqiq emas: saqlanadi, lekin menejer ko'rib qolishi uchun oyna yopilmaydi.
      if (saved.conflicts.length) setWarning(saved.conflicts)
      else onClose()
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title={shoot ? 'Syomkani o‘zgartirish' : 'Yangi syomka'} onClose={onClose}>
      {warning.length > 0 ? (
        <div className="space-y-3">
          <ConflictBox conflicts={warning} />
          <p className="text-[13px] text-muted">Syomka saqlandi. Kerak bo‘lsa vaqtni yoki ishtirokchini o‘zgartiring.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Tushunarli</Button></div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
          <Field label="Mijoz">
            <Select value={form.project} onChange={(e) => { setForm({ ...form, project: e.target.value }); setPeople([]) }} required disabled={!!shoot}>
              <option value="">Tanlang…</option>
              {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sana"><Input type="date" value={form.date} onChange={set('date')} required /></Field>
            <Field label="Boshlanish"><Input type="time" value={form.start_time} onChange={set('start_time')} /></Field>
            <Field label="Tugash"><Input type="time" value={form.end_time} onChange={set('end_time')} /></Field>
          </div>
          <Field label="Joy"><Input value={form.location} onChange={set('location')} /></Field>
          {project && (
            <div>
              <Kicker>Kim boradi</Kicker>
              {project.assignments.length === 0 && <div className="text-[13px] text-muted">Loyihaga hali hech kim biriktirilmagan.</div>}
              <div className="space-y-1">
                {project.assignments.map((a) => (
                  <label key={a.id} className="flex min-h-9 cursor-pointer items-center gap-2.5">
                    <input type="checkbox" className="h-4 w-4 accent-[#121210]" checked={people.includes(a.user)}
                      onChange={(e) => setPeople(e.target.checked ? [...people, a.user] : people.filter((id) => id !== a.user))} />
                    {a.user_name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Field label="Mijoz nima tayyorlasin" hint="Mijozga shu matn yuboriladi"><Textarea value={form.client_prep} onChange={set('client_prep')} placeholder="Masalan: xonani tayyorlang, shifokor 10:00 da bo‘lsin" /></Field>
          <Field label="Ichki izoh" hint="Mijozga ko‘rinmaydi"><Textarea value={form.notes} onChange={set('notes')} /></Field>
          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Bekor</Button><Button disabled={save.isPending}>Saqlash</Button></div>
        </form>
      )}
    </Modal>
  )
}

function ConflictBox({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <div className="rounded-xl bg-bad/10 p-3 text-[13px]">
      <div className="mb-1 flex items-center gap-2 font-bold text-bad"><AlertTriangle size={15} />Bandlik to‘qnashuvi</div>
      {conflicts.map((c) => <div key={c.shoot}>{c.people.join(', ')} shu vaqtda band: {c.client} ({c.when})</div>)}
    </div>
  )
}

function ShootModal({ shoot: s, onClose }: { shoot: Shoot; onClose: () => void }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const manage = can('content.manage')
  const [editing, setEditing] = useState(false)
  const act = useMutation({
    mutationFn: (action: 'complete' | 'cancel') => post(`/content/shoot-days/${s.id}/${action}/`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shoots'] }); onClose() },
  })
  if (editing) return <ShootForm shoot={s} onClose={() => { setEditing(false); onClose() }} />
  return (
    <Modal title={s.client_name} onClose={onClose}>
      <div className="space-y-3 text-[13.5px]">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={s.status === 'planned' ? 'open' : s.status} label={s.status_label} />
          {s.client_confirmed_at ? <Badge tone="ok">Mijoz tasdiqladi</Badge> : <Badge tone="warn">Mijoz tasdiqlamagan</Badge>}
        </div>
        <div><b className="num">{date(s.date)} {hm(s.start_time)}{s.end_time && `–${hm(s.end_time)}`}</b>{s.location && ` · ${s.location}`}</div>
        <div>Kim boradi: <b>{s.participant_names.join(', ') || 'belgilanmagan'}</b></div>
        {s.client_prep && <div>Mijoz tayyorlaydi: {s.client_prep}</div>}
        {s.notes && <div className="text-muted whitespace-pre-wrap">{s.notes}</div>}
        {s.open_briefs > 0 && <div><Link to="/app/briefs" className="font-semibold text-bronze">Ochiq TZ: {s.open_briefs} ta →</Link></div>}
        {s.conflicts.length > 0 && <ConflictBox conflicts={s.conflicts} />}
        <ErrorBox error={act.error} />
        {s.status === 'planned' && (
          <div className="flex flex-wrap justify-end gap-2">
            {manage && <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate('cancel')}>Bekor qilish</Button>}
            {manage && <Button variant="ghost" onClick={() => setEditing(true)}>O‘zgartirish</Button>}
            {can('content.upload') && <Button disabled={act.isPending} onClick={() => act.mutate('complete')}>O‘tkazildi</Button>}
          </div>
        )}
      </div>
    </Modal>
  )
}
