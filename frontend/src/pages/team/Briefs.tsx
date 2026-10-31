import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { get, patch, post } from '../../shared/api/client'
import type { Page } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, dateTime } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Textarea } from '../../shared/ui'
import { useActiveProjects } from './Content'

interface Shot { text: string; done: boolean }

interface Brief {
  id: number
  project: number
  client_name: string
  content_item: number | null
  content_title: string
  shoot_day: number | null
  shoot_date: string | null
  title: string
  assignee: number
  assignee_name: string
  goal: string
  script: string
  shot_list: Shot[]
  format: string
  references: string
  location: string
  talent: string
  notes: string
  deadline: string | null
  status: string
  status_label: string
  review_comment: string
  created_by_name: string
  sent_at: string | null
  seen_at: string | null
  is_overdue: boolean
}

const FILTERS: [string, string][] = [['open', 'Ochiq'], ['review', 'Tekshiruvda'], ['draft', 'Qoralama'], ['done', 'Bajarilgan']]
const OPEN = ['sent', 'in_progress', 'changes']

export function BriefsPage() {
  const { can, user } = useAuth()
  const [params] = useSearchParams()
  const manage = can('content.manage')
  const [filter, setFilter] = useState('open')
  const [creating, setCreating] = useState(params.get('new') === '1')
  const list = useQuery({ queryKey: ['briefs'], queryFn: () => get<Page<Brief>>('/content/briefs/', { page_size: 300 }) })
  const rows = (list.data?.results ?? []).filter((b) => (filter === 'open' ? OPEN.includes(b.status) : b.status === filter))
  return (
    <>
      <PageHeader title="TZ" subtitle={manage ? 'Ijodkorlarga beriladigan topshiriqlar' : `${user?.full_name.split(' ')[0]}, sizga berilgan topshiriqlar`}
        actions={manage && <Button onClick={() => setCreating(true)}><Plus size={16} />Yangi TZ</Button>} />
      <Tabs value={filter} onChange={setFilter} items={manage ? FILTERS : FILTERS.filter(([key]) => key !== 'draft')} />
      <ErrorBox error={list.error} />
      {list.isLoading ? <Spinner /> : rows.length === 0 ? <Empty title="TZ yo‘q" hint={manage ? 'Yangi TZ yozing: ijodkorga xabar boradi.' : 'Yangi TZ kelsa, xabar olasiz.'} /> : (
        <Table head={['TZ', 'Mijoz', 'Kimga', 'Muddat', 'Holat']}>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>
                <Link to={`/app/briefs/${b.id}`} className="font-semibold hover:underline">{b.title}</Link>
                {b.shot_list.length > 0 && <div className="num text-[12px] text-muted">{b.shot_list.filter((s) => s.done).length}/{b.shot_list.length} kadr</div>}
              </td>
              <td>{b.client_name}</td>
              <td>{b.assignee_name}</td>
              <td>{b.is_overdue ? <Badge tone="bad">{dateTime(b.deadline)}</Badge> : <span className="num whitespace-nowrap">{dateTime(b.deadline)}</span>}</td>
              <td><StatusBadge status={b.status} label={b.status_label} /></td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <BriefForm onClose={() => setCreating(false)} initial={{ project: params.get('project') ?? '', content_item: params.get('item') ?? '', title: params.get('title') ?? '' }} />}
    </>
  )
}

interface BriefInitial { project?: string; content_item?: string; title?: string }

function BriefForm({ onClose, initial, brief }: { onClose: () => void; initial?: BriefInitial; brief?: Brief }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const projects = useActiveProjects()
  const [form, setForm] = useState({
    project: brief ? String(brief.project) : initial?.project ?? '',
    title: brief?.title ?? initial?.title ?? '',
    assignee: brief ? String(brief.assignee) : '',
    deadline: brief?.deadline ? toLocal(brief.deadline) : '',
    goal: brief?.goal ?? '', script: brief?.script ?? '', format: brief?.format ?? '', references: brief?.references ?? '',
    location: brief?.location ?? '', talent: brief?.talent ?? '', notes: brief?.notes ?? '',
  })
  const [shots, setShots] = useState<string[]>(brief?.shot_list.map((s) => s.text) ?? [''])
  const project = projects.data?.results.find((p) => String(p.id) === form.project)
  const save = useMutation({
    mutationFn: () => {
      const previous = new Map(brief?.shot_list.map((s) => [s.text, s.done]))
      const body = {
        ...form,
        project: Number(form.project),
        assignee: Number(form.assignee),
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        shot_list: shots.map((text) => ({ text, done: previous.get(text) ?? false })),
        ...(initial?.content_item ? { content_item: Number(initial.content_item) } : {}),
      }
      return brief ? patch<Brief>(`/content/briefs/${brief.id}/`, body) : post<Brief>('/content/briefs/', body)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
      queryClient.invalidateQueries({ queryKey: ['brief', saved.id] })
      onClose()
      if (!brief) navigate(`/app/briefs/${saved.id}`)
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title={brief ? 'TZ’ni tahrirlash' : 'Yangi TZ'} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mijoz">
            <Select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value, assignee: '' })} required>
              <option value="">Tanlang…</option>
              {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
            </Select>
          </Field>
          <Field label="Kimga" hint={form.project && !project?.assignments.length ? 'Bu loyihaga hali hech kim biriktirilmagan' : undefined}>
            <Select value={form.assignee} onChange={set('assignee')} required>
              <option value="">Tanlang…</option>
              {project?.assignments.map((a) => <option key={a.id} value={a.user}>{a.user_name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Nima qilinadi"><Input value={form.title} onChange={set('title')} placeholder="Masalan: Bahor aksiyasi uchun Reels" required /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Muddat"><Input type="datetime-local" value={form.deadline} onChange={set('deadline')} /></Field>
          <Field label="Format"><Input value={form.format} onChange={set('format')} placeholder="9:16, 30 soniya" /></Field>
          <Field label="Joy"><Input value={form.location} onChange={set('location')} /></Field>
          <Field label="Kadrda kim"><Input value={form.talent} onChange={set('talent')} placeholder="Masalan: shifokor Aziza" /></Field>
        </div>
        <Field label="Maqsad"><Textarea value={form.goal} onChange={set('goal')} placeholder="Bu kontent nimaga kerak, kim ko‘radi?" /></Field>
        <Field label="Ssenariy yoki matn"><Textarea rows={5} value={form.script} onChange={set('script')} /></Field>
        <div>
          <Kicker>Kadrlar ro‘yxati</Kicker>
          <div className="space-y-2">
            {shots.map((text, i) => (
              <div key={i} className="flex gap-2">
                <Input value={text} aria-label={`Kadr ${i + 1}`} placeholder={`${i + 1}-kadr`} onChange={(e) => setShots(shots.map((s, n) => (n === i ? e.target.value : s)))} />
                <Button type="button" variant="ghost" aria-label="Kadrni o‘chirish" onClick={() => setShots(shots.filter((_, n) => n !== i))}><Trash2 size={15} /></Button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={() => setShots([...shots, ''])}><Plus size={15} />Kadr qo‘shish</Button>
          </div>
        </div>
        <Field label="Namunalar" hint="Havolalar: nimaga o‘xshasin"><Textarea value={form.references} onChange={set('references')} /></Field>
        <Field label="Qo‘shimcha"><Textarea value={form.notes} onChange={set('notes')} /></Field>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Bekor</Button><Button disabled={save.isPending}>Saqlash</Button></div>
      </form>
    </Modal>
  )
}

function toLocal(value: string) {
  const d = new Date(value)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function BriefDetailPage() {
  const { id } = useParams()
  const { can, user } = useAuth()
  const queryClient = useQueryClient()
  const manage = can('content.manage')
  const brief = useQuery({ queryKey: ['brief', id], queryFn: () => get<Brief>(`/content/briefs/${id}/`) })
  const [editing, setEditing] = useState(false)
  const [returning, setReturning] = useState(false)
  const [comment, setComment] = useState('')
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['brief', id] })
    queryClient.invalidateQueries({ queryKey: ['briefs'] })
  }
  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) => post(`/content/briefs/${id}/${action}/`, body),
    onSuccess: () => { refresh(); setReturning(false); setComment('') },
  })
  if (brief.isLoading) return <Spinner />
  const b = brief.data
  if (!b) return <><ErrorBox error={brief.error} /><Empty title="TZ topilmadi" /></>
  const mine = b.assignee === user?.id
  const worker = mine || manage
  const editable = manage && ['draft', 'sent', 'changes'].includes(b.status)
  const text = (label: string, value: string) => value && (
    <div><Kicker>{label}</Kicker><div className="break-words whitespace-pre-wrap">{value}</div></div>
  )
  return (
    <>
      <Link to="/app/briefs" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-bronze"><ArrowLeft size={14} />TZ ro‘yxati</Link>
      <PageHeader title={b.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{b.client_name} · {b.assignee_name} <StatusBadge status={b.status} label={b.status_label} /></span>}
        actions={
          <>
            {editable && <Button variant="ghost" onClick={() => setEditing(true)}>Tahrirlash</Button>}
            {manage && ['draft', 'changes'].includes(b.status) && <Button disabled={act.isPending} onClick={() => act.mutate({ action: 'send' })}>{b.status === 'draft' ? 'Yuborish' : 'Qayta yuborish'}</Button>}
            {mine && ['sent', 'changes'].includes(b.status) && <Button disabled={act.isPending} onClick={() => act.mutate({ action: 'accept' })}>Qabul qildim</Button>}
            {worker && b.status === 'in_progress' && <Button disabled={act.isPending} onClick={() => act.mutate({ action: 'submit' })}>Tayyor, topshiraman</Button>}
            {manage && b.status === 'review' && <Button variant="ghost" onClick={() => setReturning(true)}>Qaytarish</Button>}
            {manage && b.status === 'review' && <Button disabled={act.isPending} onClick={() => act.mutate({ action: 'approve' })}>Qabul qilish</Button>}
          </>
        } />
      <ErrorBox error={act.error} />
      {b.status === 'changes' && b.review_comment && <div className="mb-4 rounded-xl bg-bad/10 p-3"><b>Tuzatish kerak:</b> {b.review_comment}</div>}
      {returning && (
        <Card className="mb-4">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act.mutate({ action: 'return', body: { comment } }) }}>
            <Field label="Nimani tuzatish kerak?"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} required /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setReturning(false)}>Bekor</Button><Button disabled={act.isPending}>Qaytarish</Button></div>
          </form>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="space-y-4">
            {text('Maqsad', b.goal)}
            {text('Ssenariy', b.script)}
            {text('Namunalar', b.references)}
            {text('Qo‘shimcha', b.notes)}
            {!b.goal && !b.script && !b.references && !b.notes && <div className="text-muted">Batafsil matn yozilmagan.</div>}
          </Card>
          {b.shot_list.length > 0 && (
            <Card>
              <Kicker>Kadrlar · {b.shot_list.filter((s) => s.done).length}/{b.shot_list.length}</Kicker>
              <div className="divide-y divide-line-soft">
                {b.shot_list.map((s, i) => (
                  <label key={i} className="flex min-h-10 cursor-pointer items-center gap-3 py-2">
                    <input type="checkbox" className="h-4 w-4 accent-[#121210]" checked={s.done} disabled={!worker || !['in_progress', 'changes'].includes(b.status) || act.isPending}
                      onChange={(e) => act.mutate({ action: 'shot', body: { index: i, done: e.target.checked } })} />
                    <span className={s.done ? 'text-muted line-through' : undefined}>{s.text}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}
        </div>
        <Card className="h-fit space-y-2 text-[13.5px]">
          <Kicker>Ma’lumot</Kicker>
          <div>Muddat: {b.is_overdue ? <Badge tone="bad">{dateTime(b.deadline)}</Badge> : <b className="num">{dateTime(b.deadline)}</b>}</div>
          {b.format && <div>Format: <b>{b.format}</b></div>}
          {b.location && <div>Joy: <b>{b.location}</b></div>}
          {b.talent && <div>Kadrda: <b>{b.talent}</b></div>}
          {b.content_item && <div>Kontent: <Link to={`/app/content/${b.content_item}`} className="font-semibold text-bronze">{b.content_title}</Link></div>}
          {b.shoot_date && <div>Syomka: <Link to="/app/schedule" className="font-semibold text-bronze">{date(b.shoot_date)}</Link></div>}
          <div>Kim berdi: <b>{b.created_by_name || '—'}</b></div>
          {manage && b.sent_at && <div>Yuborildi: <span className="num">{dateTime(b.sent_at)}</span></div>}
          {manage && b.sent_at && <div>Ochildi: {b.seen_at ? <span className="num">{dateTime(b.seen_at)}</span> : <Badge tone="warn">Hali ochilmagan</Badge>}</div>}
          {manage && !['done', 'cancelled'].includes(b.status) && <Button variant="ghost" className="mt-2 w-full" disabled={act.isPending} onClick={() => act.mutate({ action: 'cancel' })}>Bekor qilish</Button>}
        </Card>
      </div>
      {editing && <BriefForm brief={b} onClose={() => setEditing(false)} />}
    </>
  )
}
