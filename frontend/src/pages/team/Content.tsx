import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { get, post } from '../../shared/api/client'
import type { ContentItem, Page, Project } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { monthKey, monthLabel, shiftMonth, today } from '../../shared/lib/format'
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
  const [view, setView] = useState<'calendar' | 'board'>(params.get('view') === 'board' ? 'board' : 'calendar')
  const [creating, setCreating] = useState<string | null>(params.get('new') === '1' ? today() : null)

  useEffect(() => {
    if (!projectId && projects.data?.results[0]) setParams({ project: String(projects.data.results[0].id), month }, { replace: true })
  }, [projectId, projects.data, month, setParams])

  const items = useQuery({
    queryKey: ['content', projectId, month],
    queryFn: () => get<Page<ContentItem>>('/content/items/', { project: projectId, month, page_size: 300 }),
    enabled: !!projectId,
  })
  const project = projects.data?.results.find((p) => String(p.id) === projectId)
  // Shu oy: har tur bo'yicha nechta rejada, nechtasi joylandi va tarif bo'yicha nechta bo'lishi kerak.
  const counts = useMemo(() => {
    const result: Record<string, { planned: number; published: number }> = {}
    items.data?.results.filter((i) => i.status !== 'cancelled').forEach((i) => {
      const row = result[i.kind] ?? { planned: 0, published: 0 }
      row.planned += 1
      if (i.status === 'published') row.published += 1
      result[i.kind] = row
    })
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
      </div>
      {project && <KindCounts counts={counts} limits={project.limits} />}
      <Tabs value={view} onChange={setView} items={[['calendar', 'Kalendar'], ['board', 'Holatlar bo‘yicha']]} />
      <ProgressLegend />
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
      {creating !== null && !!projectId && <CreateItem projectId={Number(projectId)} defaultDate={creating} onClose={() => setCreating(null)} />}
    </>
  )
}

const KIND_LABELS: [string, string][] = [['reels', 'Reels'], ['post', 'Post (karusel)'], ['stories', 'Stories'], ['video', 'Video']]

function KindCounts({ counts, limits }: { counts: Record<string, { planned: number; published: number }>; limits: Record<string, number> }) {
  const kinds = KIND_LABELS.filter(([kind]) => counts[kind] || limits[kind])
  const total = Object.values(counts).reduce((sum, c) => ({ planned: sum.planned + c.planned, published: sum.published + c.published }), { planned: 0, published: 0 })
  const totalLimit = Object.values(limits).reduce((sum, qty) => sum + qty, 0)
  const tiles = [...kinds.map(([kind, label]) => ({ key: kind, label, ...(counts[kind] ?? { planned: 0, published: 0 }), limit: limits[kind] ?? 0 })),
    { key: 'total', label: 'Jami', ...total, limit: totalLimit }]
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => {
        const full = t.limit > 0 && t.planned >= t.limit
        return (
          <div key={t.key} className={clsx('rounded-2xl border p-3', t.key === 'total' ? 'border-ink bg-ink text-ivory' : 'border-line-soft bg-white')}>
            <div className={clsx('text-[12px] font-bold', t.key === 'total' ? 'text-gold' : 'text-muted')}>{t.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="num font-display text-[26px] leading-none font-bold">{t.planned}</span>
              {t.limit > 0 && <span className={clsx('num text-[13px]', t.key === 'total' ? 'text-muted-2' : 'text-muted')}>/ {t.limit}</span>}
            </div>
            {t.limit > 0 && (
              <div className={clsx('mt-2 h-1.5 overflow-hidden rounded-full', t.key === 'total' ? 'bg-ink-3' : 'bg-ivory')}>
                <div className={clsx('h-full rounded-full', full ? 'bg-ok' : 'bg-gold')} style={{ width: `${Math.min(100, (t.planned / t.limit) * 100)}%` }} />
              </div>
            )}
            <div className={clsx('mt-1.5 text-[11.5px]', t.key === 'total' ? 'text-muted-2' : 'text-muted')}>
              {t.published} ta joylandi{t.limit > t.planned ? ` · yana ${t.limit - t.planned} ta kerak` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Rang qoidasi: yashil — tayyor (tasdiqlandi/joylandi), sariq — jarayonda, qizil — boshlanmagan,
// to'q qizil — sanasi o'tib ketgan, lekin joylanmagan.
type Progress = 'done' | 'progress' | 'todo' | 'late' | 'cancelled'
const DONE_STATUSES = ['approved', 'published']

export function contentProgress(item: Pick<ContentItem, 'status' | 'planned_date'>): Progress {
  if (item.status === 'cancelled') return 'cancelled'
  if (DONE_STATUSES.includes(item.status)) return 'done'
  if (item.planned_date && item.planned_date < today()) return 'late'
  return item.status === 'idea' ? 'todo' : 'progress'
}

const PROGRESS_STYLE: Record<Progress, string> = {
  done: 'bg-ok-soft text-ok border-l-[3px] border-ok',
  progress: 'bg-gold-soft text-gold-ink border-l-[3px] border-gold-deep',
  todo: 'bg-bad-soft text-bad border-l-[3px] border-bad/60',
  late: 'bg-bad text-white border-l-[3px] border-[#8e1c1c]',
  cancelled: 'bg-ivory text-muted line-through border-l-[3px] border-line',
}

function ProgressLegend() {
  const rows: [Progress, string][] = [['done', 'Tayyor / joylandi'], ['progress', 'Jarayonda'], ['todo', 'Boshlanmagan'], ['late', 'Muddati o‘tgan']]
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
      {rows.map(([key, label]) => (
        <span key={key} className="inline-flex items-center gap-1.5"><span className={clsx('h-3 w-4 rounded-sm', PROGRESS_STYLE[key])} />{label}</span>
      ))}
    </div>
  )
}

function ItemCard({ item }: { item: ContentItem }) {
  return (
    <Link to={`/app/content/${item.id}`} className={clsx('block rounded-lg p-2.5 hover:brightness-95', PROGRESS_STYLE[contentProgress(item)])}>
      <div className="num text-[10.5px] uppercase opacity-75">{item.kind_label}</div>
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
                    className={clsx('block rounded-lg px-2 py-1 text-[11.5px] leading-tight transition-[filter] hover:brightness-95', PROGRESS_STYLE[contentProgress(it)])}>
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

interface PlanStep { position: string; label: string; assignee: number | null; assignee_name: string | null }
interface StepForm { assignee: string; due_date: string; due_time: string; tz: string; open: boolean }

// Yangi kontent: mavzu + har bosqich uchun kim qiladi, qachongacha va (xohlasa) TZ — hammasi bitta oynada.
function CreateItem({ projectId, defaultDate, onClose }: { projectId: number; defaultDate: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const projects = useActiveProjects()
  const plan = useQuery({ queryKey: ['content-plan', projectId], queryFn: () => get<Record<string, PlanStep[]>>('/content/items/plan/', { project: projectId }) })
  const [form, setForm] = useState({ kind: 'reels', title: '', caption: '', planned_date: defaultDate })
  const [steps, setSteps] = useState<Record<string, StepForm>>({})
  const team = (projects.data?.results.find((p) => p.id === projectId)?.assignments ?? []).filter((a) => !a.ended_at)
  const people = [...new Map(team.map((a) => [a.user, { id: a.user, name: a.user_name, role: a.position_detail?.name ?? '' }])).values()]
  const rows = plan.data?.[form.kind] ?? []

  useEffect(() => {
    const next: Record<string, StepForm> = {}
    for (const step of plan.data?.[form.kind] ?? []) {
      next[step.position] = { assignee: step.assignee ? String(step.assignee) : '', due_date: '', due_time: '18:00', tz: '', open: false }
    }
    setSteps(next)
  }, [plan.data, form.kind])

  const update = (code: string, patch: Partial<StepForm>) => setSteps((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }))
  const tzCount = rows.filter((r) => steps[r.position]?.tz.trim()).length
  const create = useMutation({
    mutationFn: () => post('/content/items/', {
      ...form, project: projectId, planned_date: form.planned_date || null,
      steps: rows.map((r) => {
        const step = steps[r.position]
        return { position: r.position, assignee: step?.assignee ? Number(step.assignee) : null, due_date: step?.due_date || null, due_time: step?.due_time || null, tz: step?.tz ?? '' }
      }),
    }),
    onSuccess: () => {
      for (const key of ['content', 'tasks', 'briefs']) queryClient.invalidateQueries({ queryKey: [key] })
      onClose()
    },
  })
  return (
    <Modal title="Yangi kontent" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Turi">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="reels">Reels</option><option value="post">Post</option><option value="stories">Stories</option><option value="video">Video</option>
            </Select>
          </Field>
          <Field label="Joylash sanasi"><Input type="date" value={form.planned_date} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} /></Field>
        </div>
        <Field label="Mavzu"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus /></Field>
        <Field label="Matn / g‘oya"><Textarea rows={2} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></Field>

        <div className="rounded-2xl border border-line-soft bg-ivory/60 p-3">
          <div className="mb-2 text-[13px] font-bold">Kim qiladi va TZ</div>
          {plan.isLoading ? <Spinner /> : rows.length === 0 ? <div className="text-[13px] text-muted">Bu turga bosqich yo‘q</div> : (
            <div className="space-y-2.5">
              {rows.map((r) => {
                const step = steps[r.position]
                if (!step) return null
                return (
                  <div key={r.position} className="rounded-xl bg-white p-2.5">
                    <div className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[120px_1fr_150px_auto]">
                      <div className="col-span-2 text-[13px] font-semibold sm:col-span-1 sm:self-center">{r.label}</div>
                      <Select value={step.assignee} onChange={(e) => update(r.position, { assignee: e.target.value })} aria-label={`${r.label}: kim qiladi`}>
                        <option value="">Biriktirilmagan</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` · ${p.role}` : ''}</option>)}
                      </Select>
                      <Input type="date" value={step.due_date} onChange={(e) => update(r.position, { due_date: e.target.value })}
                        aria-label={`${r.label}: muddat`} title="Muddat (bo‘sh bo‘lsa — joylash sanasi)" className="hidden sm:block" />
                      <button type="button" onClick={() => update(r.position, { open: !step.open })}
                        className={clsx('h-11 rounded-xl border px-3 text-[12.5px] font-bold whitespace-nowrap',
                          step.tz.trim() ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line bg-white text-text-2 hover:border-ink')}>
                        {step.tz.trim() ? 'TZ ✓' : '+ TZ'}
                      </button>
                    </div>
                    {step.open && (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-[1fr_120px] gap-2 sm:flex sm:items-center">
                          <Input type="date" value={step.due_date} onChange={(e) => update(r.position, { due_date: e.target.value })} aria-label={`${r.label}: muddat`} className="sm:hidden" />
                          <span className="hidden text-[12.5px] font-semibold text-muted sm:inline">TZ muddati: {step.due_date ? step.due_date.split('-').reverse().join('.') : 'joylash sanasi'}, soat</span>
                          <Input type="time" value={step.due_time} onChange={(e) => update(r.position, { due_time: e.target.value })} aria-label={`${r.label}: TZ soati`} className="sm:!w-[120px]" />
                        </div>
                        <Textarea rows={3} value={step.tz} onChange={(e) => update(r.position, { tz: e.target.value })} autoFocus
                          placeholder="TZ: nima qilish kerak, kadrlar, format (9:16, 30 soniya), namunalar…" aria-label={`${r.label}: TZ`} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-2 text-[12px] text-muted">
            Har bosqich vazifa bo‘lib tushadi. TZ yozilganlariga TZ yuboriladi, ijrochiga panel va Telegram’da xabar boradi.
          </p>
        </div>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>
          {tzCount ? `Rejaga qo‘shish va ${tzCount} ta TZ yuborish` : 'Rejaga qo‘shish'}
        </Button>
      </form>
    </Modal>
  )
}
