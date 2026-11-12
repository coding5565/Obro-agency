import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Pencil, Send, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { get, patch, post, upload } from '../../shared/api/client'
import type { ContentItem, Page, Task, Version } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, dateTime, today } from '../../shared/lib/format'
import { Badge, Button, Card, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea } from '../../shared/ui'

const MANUAL_STATUS: Record<string, [string, string][]> = {
  idea: [['script', 'Ssenariy'], ['shooting', 'Suratga olish'], ['editing', 'Tayyorlash']],
  script: [['shooting', 'Suratga olish'], ['editing', 'Tayyorlash']],
  shooting: [['editing', 'Tayyorlash']],
  editing: [['internal_review', 'Ichki tekshiruvga']],
  changes: [['editing', 'Tayyorlash']],
  cancelled: [['idea', 'Rejaga qaytarish']],
}

export function ContentDetailPage() {
  const { id } = useParams()
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const item = useQuery({ queryKey: ['content-item', id], queryFn: () => get<ContentItem>(`/content/items/${id}/`) })
  const tasks = useQuery({ queryKey: ['tasks', { content: id }], queryFn: () => get<Page<Task>>('/tasks/', { content_item: id }) })
  const briefs = useQuery({ queryKey: ['briefs', { content: id }], queryFn: () => get<Page<{ id: number; title: string; assignee_name: string; status: string; status_label: string }>>('/content/briefs/', { content_item: id }) })
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['content-item', id] })
    queryClient.invalidateQueries({ queryKey: ['content'] })
  }
  const action = useMutation({ mutationFn: (path: string) => post(`/content/items/${id}/${path}/`), onSuccess: refresh })
  const setStatus = useMutation({ mutationFn: (status: string) => post(`/content/items/${id}/set-status/`, { status }), onSuccess: refresh })
  const addComment = useMutation({
    mutationFn: () => post(`/content/items/${id}/comments/`, { body: comment }),
    onSuccess: () => { setComment(''); refresh() },
  })
  if (item.isLoading) return <Spinner />
  const it = item.data
  if (!it) return <ErrorBox error={item.error} />
  const manage = can('content.manage')

  return (
    <>
      <PageHeader
        title={it.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{it.client_name} · {it.kind_label} · {date(it.planned_date)} <StatusBadge status={it.status} label={it.status_label} /></span>}
        actions={
          <>
            {manage && <Button variant="ghost" onClick={() => setEditing(true)}><Pencil size={15} />Tahrirlash</Button>}
            {can('content.manage') && <Link to={`/app/briefs?new=1&project=${it.project}&item=${it.id}&title=${encodeURIComponent(it.title)}`}><Button variant="ghost">TZ yozish</Button></Link>}
            {can('content.upload') && !['published', 'cancelled'].includes(it.status) && <Button variant="ghost" onClick={() => setUploading(true)}><Upload size={15} />Versiya yuklash</Button>}
            {manage && ['internal_review', 'changes'].includes(it.status) && it.latest_version && (
              <Button onClick={() => action.mutate('send-to-client')}><Send size={15} />Mijozga yuborish</Button>
            )}
            {manage && !['published', 'cancelled'].includes(it.status) && (
              <Button variant="dark" onClick={() => setPublishing(true)}><CheckCircle2 size={15} />Joylandi deb belgilash</Button>
            )}
          </>
        }
      />
      <ErrorBox error={action.error || setStatus.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <Kicker>Matn</Kicker>
            <div className="whitespace-pre-line">{it.caption || <span className="text-muted">Matn yozilmagan</span>}</div>
            {it.published_url && <a href={it.published_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-semibold text-bronze">Instagram’da ochish <ExternalLink size={14} /></a>}
          </Card>
          <Card>
            <Kicker>Versiyalar · tuzatish qoldi: {it.revisions_left}</Kicker>
            {it.versions?.length === 0 && <div className="text-muted">Hali versiya yuklanmagan</div>}
            <div className="space-y-3">{it.versions?.map((v) => <VersionRow key={v.id} version={v} />)}</div>
          </Card>
          {!!it.approvals?.length && (
            <Card>
              <Kicker>Mijoz javoblari</Kicker>
              {it.approvals.map((a) => (
                <div key={a.id} className="border-b border-line-soft py-2 last:border-0">
                  <div className="flex items-center gap-2"><Badge tone={a.decision === 'approved' ? 'ok' : 'bad'}>{a.decision === 'approved' ? 'Tasdiqladi' : 'Tuzatish'}</Badge><span className="text-[12px] text-muted">v{a.version_number} · {a.decided_by_name} · {dateTime(a.created_at)}</span></div>
                  {a.comment && <div className="mt-1">{a.timecode && <span className="num mr-1 text-bronze">{a.timecode}</span>}{a.comment}</div>}
                </div>
              ))}
            </Card>
          )}
          <Card>
            <Kicker>Ichki izohlar (mijozga ko‘rinmaydi)</Kicker>
            {it.comments?.map((c) => <div key={c.id} className="py-1.5"><span className="font-semibold">{c.author_name}:</span> {c.body} <span className="text-[11px] text-muted">{dateTime(c.created_at)}</span></div>)}
            <form onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate() }} className="mt-2 flex gap-2">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Izoh yozing…" />
              <Button type="submit" variant="dark">Yuborish</Button>
            </form>
          </Card>
        </div>
        <div className="space-y-4">
          {manage && MANUAL_STATUS[it.status] && (
            <Card>
              <Kicker>Holatni o‘zgartirish</Kicker>
              <div className="flex flex-wrap gap-2">
                {MANUAL_STATUS[it.status].map(([s, label]) => <Button key={s} variant="ghost" onClick={() => setStatus.mutate(s)}>{label}</Button>)}
                {it.status !== 'cancelled' && <Button variant="danger" onClick={() => setStatus.mutate('cancelled')}>Bekor qilish</Button>}
              </div>
            </Card>
          )}
          <Card>
            <Kicker>TZ</Kicker>
            {briefs.data?.results.length === 0 && <div className="text-[13px] text-muted">Bu kontentga TZ yozilmagan.</div>}
            {briefs.data?.results.map((b) => (
              <Link key={b.id} to={`/app/briefs/${b.id}`} className="block border-b border-line-soft py-2.5 last:border-0">
                <div className="text-[13px] leading-snug font-semibold">{b.title}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-muted">{b.assignee_name}</span>
                  <StatusBadge status={b.status} label={b.status_label} />
                </div>
              </Link>
            ))}
          </Card>
          <Card>
            <Kicker>Vazifalar</Kicker>
            {tasks.data?.results.map((t) => (
              <div key={t.id} className="border-b border-line-soft py-2.5 last:border-0">
                <div className="text-[13px] leading-snug font-semibold">{t.title}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-muted">{t.assignee_name ?? 'Biriktirilmagan'}</span>
                  <StatusBadge status={t.status} label={t.status_label} />
                </div>
              </div>
            ))}
            <Link to="/app/tasks" className="mt-2 block text-[12.5px] font-semibold text-bronze">Vazifalar sahifasi →</Link>
          </Card>
          {it.internal_notes && <Card><Kicker>Ichki izoh</Kicker>{it.internal_notes}</Card>}
        </div>
      </div>
      {uploading && <UploadVersion itemId={it.id} onClose={() => setUploading(false)} onDone={refresh} />}
      {publishing && <PublishModal item={it} onClose={() => setPublishing(false)} onDone={refresh} />}
      {editing && <EditItem item={it} onClose={() => setEditing(false)} onDone={refresh} />}
    </>
  )
}

function VersionRow({ version }: { version: Version }) {
  const isVideo = version.file_name && /\.(mp4|mov|webm|m4v)$/i.test(version.file_name)
  const isImage = version.file_name && /\.(png|jpe?g|webp|gif)$/i.test(version.file_name)
  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="num font-bold">v{version.number}</span>
        {version.client_visible ? <Badge tone="warn">Mijozga yuborilgan</Badge> : <Badge>Ichki</Badge>}
        <span className="text-muted">{version.uploaded_by_name} · {dateTime(version.created_at)}</span>
      </div>
      {isVideo && version.file_url && <video src={version.file_url} controls className="max-h-80 rounded-lg bg-ink" />}
      {isImage && version.file_url && <img src={version.file_url} alt="" className="max-h-80 rounded-lg" />}
      {version.file_url && !isVideo && !isImage && <a href={version.file_url} className="font-semibold text-bronze">{version.file_name}</a>}
      {version.link && <a href={version.link} target="_blank" rel="noreferrer" className="block font-semibold break-all text-bronze">{version.link}</a>}
      {version.note && <div className="mt-1 text-muted">{version.note}</div>}
    </div>
  )
}

function UploadVersion({ itemId, onClose, onDone }: { itemId: number; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const send = useMutation({
    mutationFn: () => {
      const form = new FormData()
      if (file) form.append('file', file)
      if (link) form.append('link', link)
      form.append('note', note)
      return upload(`/content/items/${itemId}/versions/`, form)
    },
    onSuccess: () => { onDone(); onClose() },
  })
  return (
    <Modal title="Yangi versiya" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); send.mutate() }} className="space-y-3">
        <Field label="Fayl" hint="Tayyor video yoki dizayn (300 MB gacha). Xom materialni yuklamang — Drive havolasi yetadi.">
          <Input type="file" accept="video/*,image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="yoki havola"><Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" /></Field>
        <Field label="Izoh"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox error={send.error} />
        <Button type="submit" className="w-full" disabled={send.isPending || (!file && !link)}>{send.isPending ? 'Yuklanmoqda…' : 'Yuklash'}</Button>
      </form>
    </Modal>
  )
}

function PublishModal({ item, onClose, onDone }: { item: ContentItem; onClose: () => void; onDone: () => void }) {
  const normal = item.status === 'approved' || (item.kind === 'stories' && ['idea', 'editing', 'internal_review'].includes(item.status))
  const [url, setUrl] = useState('')
  const [day, setDay] = useState(item.planned_date && item.planned_date < today() ? item.planned_date : today())
  const send = useMutation({
    mutationFn: () => post(`/content/items/${item.id}/publish/`, { url, published_on: day, skip_approval: !normal }),
    onSuccess: () => { onDone(); onClose() },
  })
  return (
    <Modal title="Joylandi deb belgilash" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); send.mutate() }} className="space-y-3">
        {!normal && (
          <div className="rounded-xl bg-warn-soft p-3 text-[13px] text-warn">
            Bu kontent mijoz tasdig‘idan o‘tmagan. Allaqachon joylangan (qilib bo‘lingan) bo‘lsa, belgilang: ochiq vazifalari ham yopiladi.
          </div>
        )}
        <Field label="Qachon joylandi"><Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} required /></Field>
        <Field label="Post havolasi (ixtiyoriy)" hint="Mijoz kalendarida shu havola ko‘rinadi"><Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/p/…" /></Field>
        <ErrorBox error={send.error} />
        <Button type="submit" className="w-full" disabled={send.isPending}>Joylandi</Button>
      </form>
    </Modal>
  )
}

function EditItem({ item, onClose, onDone }: { item: ContentItem; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    kind: item.kind, title: item.title, planned_date: item.planned_date ?? '', caption: item.caption,
    internal_notes: item.internal_notes, published_url: item.published_url ?? '',
  })
  const save = useMutation({
    mutationFn: () => patch(`/content/items/${item.id}/`, { ...form, planned_date: form.planned_date || null }),
    onSuccess: () => { onDone(); onClose() },
  })
  return (
    <Modal title="Kontentni tahrirlash" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Turi">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="reels">Reels</option><option value="post">Post</option><option value="stories">Stories</option><option value="video">Video</option>
            </Select>
          </Field>
          <Field label="Joylash sanasi"><Input type="date" value={form.planned_date} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} /></Field>
        </div>
        <Field label="Mavzu"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Matn / g‘oya"><Textarea rows={4} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></Field>
        <Field label="Ichki izoh (mijozga ko‘rinmaydi)"><Textarea rows={2} value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} /></Field>
        {item.status === 'published' && (
          <Field label="Post havolasi"><Input type="url" value={form.published_url} onChange={(e) => setForm({ ...form, published_url: e.target.value })} placeholder="https://instagram.com/p/…" /></Field>
        )}
        <ErrorBox error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Saqlash</Button>
      </form>
    </Modal>
  )
}

export function ProjectSelect({ value, onChange, projects }: { value: string; onChange: (v: string) => void; projects: { id: number; client_name: string; tariff_name: string }[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-xs">
      <option value="">Barcha loyihalar</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.client_name} · {p.tariff_name}</option>)}
    </Select>
  )
}
