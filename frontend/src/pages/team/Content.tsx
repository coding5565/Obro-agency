import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { get, post } from '../../shared/api/client'
import type { ContentItem, Page, Project } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { monthKey, monthLabel, shiftMonth } from '../../shared/lib/format'
import { Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Tabs, Textarea } from '../../shared/ui'

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const COLUMNS: [string, string][] = [['idea', 'Reja'], ['script', 'Ssenariy'], ['shooting', 'Suratga olish'], ['editing', 'Tayyorlash'],
  ['internal_review', 'Ichki tekshiruv'], ['client_review', 'Mijozda'], ['changes', 'Tuzatishda'], ['approved', 'Tasdiqlandi'], ['published', 'Joylandi']]

export function useActiveProjects() {
  return useQuery({ queryKey: ['projects', 'active'], queryFn: () => get<Page<Project>>('/projects/', { status: 'active', page_size: 200 }) })
}

export function ContentPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const projects = useActiveProjects()
  const projectId = params.get('project') ?? ''
  const month = params.get('month') ?? monthKey()
  const [view, setView] = useState<'calendar' | 'board'>('calendar')
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId && projects.data?.results[0]) setParams({ project: String(projects.data.results[0].id), month }, { replace: true })
  }, [projectId, projects.data, month, setParams])

  const items = useQuery({
    queryKey: ['content', projectId, month],
    queryFn: () => get<Page<ContentItem>>('/content/items/', { project: projectId, month, page_size: 300 }),
    enabled: !!projectId,
  })
  const project = projects.data?.results.find((p) => String(p.id) === projectId)
  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    items.data?.results.filter((i) => i.status !== 'cancelled').forEach((i) => { result[i.kind] = (result[i.kind] ?? 0) + 1 })
    return result
  }, [items.data])

  return (
    <>
      <PageHeader title="Kontent reja" actions={can('content.manage') && projectId && <Button onClick={() => setCreating('')}><Plus size={16} />Kontent qo‘shish</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={projectId} onChange={(e) => setParams({ project: e.target.value, month })} className="max-w-xs">
          {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name} · {p.tariff_name}</option>)}
        </Select>
        <div className="flex items-center rounded-lg border border-line bg-white">
          <button className="p-2" onClick={() => setParams({ project: projectId, month: shiftMonth(month, -1) })} aria-label="Oldingi oy"><ChevronLeft size={16} /></button>
          <span className="min-w-[120px] text-center font-semibold">{monthLabel(month)}</span>
          <button className="p-2" onClick={() => setParams({ project: projectId, month: shiftMonth(month, 1) })} aria-label="Keyingi oy"><ChevronRight size={16} /></button>
        </div>
        {project && (
          <div className="flex flex-wrap gap-1.5 text-[12.5px]">
            {Object.entries(project.limits).map(([kind, qty]) => (
              <span key={kind} className={clsx('num rounded border px-2 py-1', (counts[kind] ?? 0) < qty ? 'border-warn/40 text-warn' : 'border-ok/40 text-ok')}>
                {kind} reja {counts[kind] ?? 0}/{qty}
              </span>
            ))}
          </div>
        )}
      </div>
      <Tabs value={view} onChange={setView} items={[['calendar', 'Kalendar'], ['board', 'Holatlar bo‘yicha']]} />
      {items.isLoading && <Spinner />}
      {items.data && view === 'calendar' && <CalendarGrid month={month} items={items.data.results} onAdd={can('content.manage') ? setCreating : undefined} />}
      {items.data && view === 'board' && (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLUMNS.map(([status, label]) => {
            const column = items.data.results.filter((i) => i.status === status)
            return (
              <div key={status} className="w-56 shrink-0">
                <div className="mb-2 flex items-center justify-between text-[12px] font-bold text-graphite">{label}<span className="num text-muted">{column.length}</span></div>
                <div className="space-y-2">{column.map((i) => <ItemCard key={i.id} item={i} />)}</div>
              </div>
            )
          })}
        </div>
      )}
      {creating !== null && <CreateItem projectId={Number(projectId)} defaultDate={creating} onClose={() => setCreating(null)} />}
    </>
  )
}

function ItemCard({ item }: { item: ContentItem }) {
  return (
    <Link to={`/app/content/${item.id}`} className="block rounded-lg border border-[#ece4d3] bg-white p-2.5 hover:border-bronze">
      <div className="num text-[10.5px] text-bronze uppercase">{item.kind_label}</div>
      <div className="text-[13px] leading-snug font-semibold">{item.title}</div>
      <div className="mt-1.5"><StatusBadge status={item.status} label={item.status_label} /></div>
    </Link>
  )
}

function CalendarGrid({ month, items, onAdd }: { month: string; items: ContentItem[]; onAdd?: (d: string) => void }) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(y, m, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1)
  const todayKey = new Date().toISOString().slice(0, 10)
  return (
    <Card className="overflow-x-auto p-0">
      <div className="grid min-w-[700px] grid-cols-7">
        {WEEKDAYS.map((d) => <div key={d} className="mono border-b border-line px-2.5 py-2 text-[10.5px] tracking-[0.1em] text-muted uppercase">{d}</div>)}
        {cells.map((day, i) => {
          const key = day > 0 && day <= days ? `${month}-${String(day).padStart(2, '0')}` : ''
          const dayItems = key ? items.filter((it) => it.planned_date === key) : []
          return (
            <div key={i} className={clsx('group min-h-[104px] border-r border-b border-line-soft p-1.5 [&:nth-child(7n)]:border-r-0', !key && 'bg-paper')}>
              {key && (
                <div className="mb-1 flex items-center justify-between">
                  <span className={clsx('num grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11.5px]', key === todayKey ? 'bg-gold font-bold text-ink' : 'text-muted')}>{day}</span>
                  {onAdd && <button onClick={() => onAdd(key)} className="grid h-6 w-6 place-items-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ivory focus:opacity-100" aria-label="Qo‘shish"><Plus size={13} /></button>}
                </div>
              )}
              <div className="space-y-1">
                {dayItems.map((it) => (
                  <Link key={it.id} to={`/app/content/${it.id}`} title={`${it.kind_label}: ${it.title} — ${it.status_label}`}
                    className={clsx('block rounded-lg px-2 py-1 text-[11.5px] leading-tight transition-[filter] hover:brightness-95',
                      it.status === 'published' ? 'bg-ink text-ivory' : it.status === 'client_review' ? 'bg-gold text-ink' : it.status === 'changes' ? 'bg-bad-soft text-bad' : 'bg-ivory text-ink')}>
                    <span className="mono block text-[9px] tracking-[0.08em] uppercase opacity-70">{it.kind_label}</span>
                    <span className="line-clamp-2 font-semibold">{it.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function CreateItem({ projectId, defaultDate, onClose }: { projectId: number; defaultDate: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ kind: 'reels', title: '', caption: '', planned_date: defaultDate })
  const create = useMutation({
    mutationFn: () => post('/content/items/', { ...form, project: projectId, planned_date: form.planned_date || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['content'] }); onClose() },
  })
  return (
    <Modal title="Yangi kontent" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Turi">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="reels">Reels</option><option value="post">Post</option><option value="stories">Stories</option><option value="video">Video</option>
            </Select>
          </Field>
          <Field label="Sana"><Input type="date" value={form.planned_date} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} /></Field>
        </div>
        <Field label="Mavzu"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus /></Field>
        <Field label="Matn / g‘oya"><Textarea value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></Field>
        <p className="text-[12px] text-muted">Saqlanganda jamoaga vazifalar avtomatik yaratiladi (ssenariy, suratga olish, montaj).</p>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>Rejaga qo‘shish</Button>
      </form>
    </Modal>
  )
}
