import { DndContext, DragOverlay, pointerWithin, PointerSensor, rectIntersection, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Flag, Link2, MessageSquare, Plus, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { get, patch, post } from '../../shared/api/client'
import type { Page, StaffUser, Task } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, dateTime, today } from '../../shared/lib/format'
import { Badge, Button, cn, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Textarea } from '../../shared/ui'
import { useActiveProjects } from './Content'

// Vazifalar — Trello uslubidagi doska. SMM menejer kartochka ochib ishchiga beradi,
// ishchi kartochkani ustundan ustunga suradi, savol-javob kartochka ichidagi izohlarda.

type View = 'board' | 'people' | 'list'
type Person = { id: number; name: string }

const COLUMNS: { key: string; title: string; dot: string }[] = [
  { key: 'todo', title: 'Qilinadi', dot: 'bg-muted-2' },
  { key: 'in_progress', title: 'Jarayonda', dot: 'bg-info' },
  { key: 'review', title: 'Tekshiruvda', dot: 'bg-warn' },
  { key: 'done', title: 'Bajarildi', dot: 'bg-ok' },
]
const LABEL: Record<string, string> = { todo: 'Bajarilishi kerak', in_progress: 'Jarayonda', review: 'Tekshiruvda', done: 'Bajarildi', cancelled: 'Bekor qilindi' }
const OPEN = ['todo', 'in_progress', 'review']
const BOARD_KEY = ['tasks', 'board']
const VIEW_KEY = 'obro.tasks.view'
// Kartochka barmoq/sichqoncha turgan ustunga tushadi; ustunlar orasida bo'lsa, eng ko'p ustma-ust tushganiga.
const dropTarget: CollisionDetection = (args) => { const hits = pointerWithin(args); return hits.length ? hits : rectIntersection(args) }

function initials(name?: string | null) {
  return (name ?? '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

function readView(): View | null {
  try { return window.localStorage.getItem(VIEW_KEY) as View | null } catch { return null }
}

function usePeople(tasks: Task[]): Person[] {
  const users = useQuery({ queryKey: ['users', 'staff'], queryFn: () => get<Page<StaffUser>>('/users/', { staff: 1, page_size: 200 }), retry: false })
  const projects = useActiveProjects()
  return useMemo(() => {
    const map = new Map<number, string>()
    users.data?.results.filter((u) => u.is_active).forEach((u) => map.set(u.id, u.full_name))
    projects.data?.results.forEach((p) => p.assignments.forEach((a) => map.set(a.user, a.user_name)))
    tasks.forEach((t) => { if (t.assignee && t.assignee_name) map.set(t.assignee, t.assignee_name) })
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [users.data, projects.data, tasks])
}

export function TasksPage() {
  const { user, can } = useAuth()
  const manage = can('tasks.manage')
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const wanted = (params.get('view') as View | null) ?? readView() ?? 'board'
  const view: View = wanted === 'people' && !manage ? 'board' : wanted
  const [client, setClient] = useState('')
  const [person, setPerson] = useState(manage ? '' : 'me')
  const [creating, setCreating] = useState<{ status?: string; assignee?: string } | null>(params.get('new') === '1' ? {} : null)
  const [dragging, setDragging] = useState<Task | null>(null)
  const openId = params.get('task')

  const list = useQuery({ queryKey: BOARD_KEY, queryFn: () => get<Page<Task>>('/tasks/', { board: 1, page_size: 500 }) })
  const all = useMemo(() => list.data?.results ?? [], [list.data])
  const people = usePeople(all)
  const clients = useMemo(() => [...new Set(all.map((t) => t.client_name))].sort(), [all])
  const tasks = all.filter((t) => (!client || t.client_name === client)
    && (!person || (person === 'me' ? t.assignee === user?.id || t.assignee === null : person === 'none' ? t.assignee === null : String(t.assignee) === person)))

  const setView = (next: View) => {
    try { window.localStorage.setItem(VIEW_KEY, next) } catch { /* brauzer xotirasi yopiq bo'lsa ham ishlayveradi */ }
    const p = new URLSearchParams(params); p.set('view', next); setParams(p, { replace: true })
  }
  const openTask = (id: number | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('task', String(id)); else p.delete('task')
    setParams(p, { replace: !id })
  }

  const move = useMutation({
    mutationFn: ({ task, to, kind }: { task: Task; to: string; kind: 'status' | 'assignee' }) => kind === 'status'
      ? post(`/tasks/${task.id}/set-status/`, { status: to })
      : patch(`/tasks/${task.id}/`, { assignee: to === 'none' ? null : Number(to) }),
    onMutate: async ({ task, to, kind }) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY })
      const prev = queryClient.getQueryData<Page<Task>>(BOARD_KEY)
      const changes: Partial<Task> = kind === 'status'
        ? { status: to, status_label: LABEL[to] }
        : { assignee: to === 'none' ? null : Number(to), assignee_name: people.find((p) => String(p.id) === to)?.name ?? null }
      queryClient.setQueryData<Page<Task>>(BOARD_KEY, (old) => old && { ...old, results: old.results.map((t) => (t.id === task.id ? { ...t, ...changes } : t)) })
      return { prev }
    },
    onError: (_error, _vars, context) => { if (context?.prev) queryClient.setQueryData(BOARD_KEY, context.prev) },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const canMove = (t: Task) => manage || t.assignee === null || t.assignee === user?.id
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )
  const onDragStart = (e: DragStartEvent) => setDragging(all.find((t) => t.id === e.active.id) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const task = all.find((t) => t.id === e.active.id)
    const target = e.over?.id ? String(e.over.id) : null
    if (!task || !target) return
    const [kind, to] = target.split(':') as ['status' | 'assignee', string]
    if (kind === 'status' && to !== task.status) move.mutate({ task, to, kind })
    if (kind === 'assignee' && to !== String(task.assignee ?? 'none')) move.mutate({ task, to, kind })
  }

  const columns: { id: string; title: string; dot: string; items: Task[]; add?: { status?: string; assignee?: string } }[] = view === 'people'
    ? [{ id: 'assignee:none', title: 'Biriktirilmagan', dot: 'bg-muted-2', items: tasks.filter((t) => !t.assignee && OPEN.includes(t.status)), add: {} },
      ...people.filter((p) => !person || String(p.id) === person || (person === 'me' && p.id === user?.id)).map((p) => ({
        id: `assignee:${p.id}`, title: p.name, dot: 'bg-gold', add: { assignee: String(p.id) },
        items: tasks.filter((t) => t.assignee === p.id && OPEN.includes(t.status)),
      }))]
    : COLUMNS.map((c) => ({ id: `status:${c.key}`, title: c.title, dot: c.dot, items: tasks.filter((t) => t.status === c.key), add: c.key === 'done' ? undefined : { status: c.key } }))

  const views: [View, string][] = manage ? [['board', 'Doska'], ['people', 'Xodimlar bo‘yicha'], ['list', 'Ro‘yxat']] : [['board', 'Doska'], ['list', 'Ro‘yxat']]
  return (
    <>
      <PageHeader title="Vazifalar" subtitle={manage ? 'Kartochka oching, ishchiga bering va jarayonni kuzating' : 'Kartochkani surib holatini o‘zgartiring'}
        actions={manage && <Button onClick={() => setCreating({})}><Plus size={16} />Vazifa</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={view} onChange={setView} items={views} />
        <Select value={client} onChange={(e) => setClient(e.target.value)} className="!h-10 !w-auto min-w-36" aria-label="Mijoz">
          <option value="">Barcha mijozlar</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={person} onChange={(e) => setPerson(e.target.value)} className="!h-10 !w-auto min-w-36" aria-label="Xodim">
          <option value="">Hamma xodimlar</option>
          <option value="me">Menga</option>
          {manage && <option value="none">Biriktirilmagan</option>}
          {manage && people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <ErrorBox error={move.error} />
      {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : view === 'list' ? (
        tasks.length === 0 ? <Empty title="Vazifa yo‘q" /> : (
          <Table head={['Vazifa', 'Mijoz', 'Kimga', 'Muddat', 'Holat']}>
            {[...tasks].sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).map((t) => (
              <tr key={t.id} onClick={() => openTask(t.id)} className="cursor-pointer hover:bg-ivory/50">
                <td className="font-semibold">{t.title}</td>
                <td>{t.client_name}</td>
                <td>{t.assignee_name ?? <span className="text-muted">—</span>}</td>
                <td>{t.is_overdue ? <Badge tone="bad">{date(t.due_date)}</Badge> : <span className="num">{date(t.due_date)}</span>}</td>
                <td><StatusBadge status={t.status} label={t.status_label} /></td>
              </tr>
            ))}
          </Table>
        )
      ) : (
        <DndContext sensors={sensors} collisionDetection={dropTarget} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-6 lg:mx-0 lg:px-0">
            {columns.map((col) => (
              <Column key={col.id} id={col.id} title={col.title} dot={col.dot} count={col.items.length}
                onAdd={manage && col.add ? () => setCreating(col.add!) : undefined}>
                {col.items.map((t) => <TaskCard key={t.id} task={t} draggable={view === 'people' ? manage : canMove(t)} onOpen={openTask} showStatus={view === 'people'} />)}
              </Column>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{dragging && <div className="w-[260px] rotate-2 shadow-raise"><CardBody task={dragging} /></div>}</DragOverlay>
        </DndContext>
      )}
      {creating && <CreateTask project={params.get('project') ?? ''} status={creating.status} assignee={creating.assignee} people={people}
        onClose={() => { setCreating(null); if (params.get('new')) { const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }) } }} />}
      {openId && <TaskModal id={Number(openId)} people={people} onClose={() => openTask(null)} />}
    </>
  )
}

function Column({ id, title, dot, count, onAdd, children }: { id: string; title: string; dot: string; count: number; onAdd?: () => void; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} className={cn('flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl bg-ivory p-2.5 transition-shadow sm:w-[280px]', isOver && 'ring-2 ring-gold')}>
      <header className="mb-2 flex items-center gap-2 px-1.5 pt-1">
        <span className={cn('h-2.5 w-2.5 rounded-full', dot)} />
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{title}</h2>
        <span className="num rounded-full bg-white px-2 text-[11.5px] leading-5 text-muted">{count}</span>
      </header>
      <div className="min-h-14 space-y-2">{children}</div>
      {onAdd && (
        <button type="button" onClick={onAdd} className="mt-2 flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold text-muted hover:bg-white hover:text-ink">
          <Plus size={15} />Kartochka qo‘shish
        </button>
      )}
    </section>
  )
}

function TaskCard({ task, draggable, onOpen, showStatus }: { task: Task; draggable: boolean; onOpen: (id: number) => void; showStatus?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !draggable })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(task.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task.id) }}
      role="button" tabIndex={0} aria-label={`${task.title}, ${task.status_label}`}
      className={cn('touch-manipulation rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold', draggable && 'cursor-grab active:cursor-grabbing', isDragging && 'opacity-30')}>
      <CardBody task={task} showStatus={showStatus} />
    </div>
  )
}

function CardBody({ task, showStatus }: { task: Task; showStatus?: boolean }) {
  const dueToday = task.due_date === today() && OPEN.includes(task.status)
  return (
    <div className="rounded-xl border border-line-soft bg-white p-3 shadow-[0_1px_2px_rgb(18_18_16/0.06)] hover:border-line-strong">
      {(task.priority === 'high' || showStatus) && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {task.priority === 'high' && <span className="inline-flex items-center gap-1 rounded-md bg-bad-soft px-1.5 text-[11px] leading-5 font-bold text-bad"><Flag size={11} />Muhim</span>}
          {showStatus && <StatusBadge status={task.status} label={task.status_label} />}
        </div>
      )}
      <div className="text-[13.5px] leading-snug font-semibold text-ink">{task.title}</div>
      <div className="mt-0.5 truncate text-[12px] text-muted">{task.client_name}</div>
      <div className="mt-2.5 flex items-center gap-2">
        {task.due_date && (
          <span className={cn('num inline-flex items-center gap-1 rounded-md px-1.5 text-[11.5px] leading-5',
            task.is_overdue ? 'bg-bad-soft font-bold text-bad' : dueToday ? 'bg-warn-soft font-bold text-warn' : task.status === 'done' ? 'bg-ok-soft text-ok' : 'bg-ivory text-muted')}>
            <CalendarDays size={11} />{date(task.due_date)}
          </span>
        )}
        {!!task.comment_count && <span className="inline-flex items-center gap-1 text-[11.5px] text-muted"><MessageSquare size={12} />{task.comment_count}</span>}
        {task.content_item && <Link2 size={12} className="text-muted" aria-label="Kontentga bog‘langan" />}
        <span className="ml-auto grid h-7 w-7 place-items-center rounded-full bg-gold-soft text-[10.5px] font-bold text-gold-ink" title={task.assignee_name ?? 'Biriktirilmagan'}>
          {task.assignee_name ? initials(task.assignee_name) : '?'}
        </span>
      </div>
    </div>
  )
}

interface TaskComment { id: number; author: number; author_name: string; body: string; created_at: string }

function TaskModal({ id, people, onClose }: { id: number; people: Person[]; onClose: () => void }) {
  const { user, can } = useAuth()
  const manage = can('tasks.manage')
  const queryClient = useQueryClient()
  const task = useQuery({ queryKey: ['task', id], queryFn: () => get<Task>(`/tasks/${id}/`) })
  const comments = useQuery({ queryKey: ['task', id, 'comments'], queryFn: () => get<TaskComment[]>(`/tasks/${id}/comments/`) })
  const [form, setForm] = useState<{ title: string; description: string; assignee: string; due_date: string; priority: string } | null>(null)
  const [body, setBody] = useState('')
  useEffect(() => {
    if (task.data) setForm({ title: task.data.title, description: task.data.description, assignee: task.data.assignee ? String(task.data.assignee) : '', due_date: task.data.due_date ?? '', priority: task.data.priority })
  }, [task.data])
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); queryClient.invalidateQueries({ queryKey: ['task', id] }) }
  const save = useMutation({
    mutationFn: () => patch(`/tasks/${id}/`, { ...form, assignee: form?.assignee ? Number(form.assignee) : null, due_date: form?.due_date || null }),
    onSuccess: refresh,
  })
  const setStatus = useMutation({ mutationFn: (status: string) => post(`/tasks/${id}/set-status/`, { status }), onSuccess: refresh })
  const comment = useMutation({
    mutationFn: () => post(`/tasks/${id}/comments/`, { body }),
    onSuccess: () => { setBody(''); refresh() },
  })
  const t = task.data
  const mine = t && (t.assignee === null || t.assignee === user?.id)
  const changed = t && form && (form.title !== t.title || form.description !== t.description || form.assignee !== (t.assignee ? String(t.assignee) : '')
    || form.due_date !== (t.due_date ?? '') || form.priority !== t.priority)
  return (
    <Modal title={t?.title ?? 'Vazifa'} onClose={onClose} wide>
      {task.error ? <ErrorBox error={task.error} /> : task.isLoading || !t || !form ? <Spinner /> : (
        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <StatusBadge status={t.status} label={t.status_label} />
              <span>{t.client_name}</span>
              {t.created_by_name && <span>· bergan: {t.created_by_name}</span>}
              {t.content_item && <Link to={`/app/content/${t.content_item}`} className="font-semibold text-bronze">Kontent: {t.content_title} →</Link>}
            </div>
            {manage ? (
              <>
                <Field label="Vazifa"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
                <Field label="Tafsilot"><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Nima qilish kerak, qanday bo‘lishi kerak…" /></Field>
              </>
            ) : (
              <div className="rounded-xl bg-ivory p-3 text-[14px] whitespace-pre-wrap">{t.description || <span className="text-muted">Tafsilot yozilmagan</span>}</div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-bold"><MessageSquare size={15} />Izohlar</div>
              <div className="space-y-2.5">
                {comments.data?.length === 0 && <div className="text-[13px] text-muted">Hali izoh yo‘q. Savol yoki javobni shu yerga yozing.</div>}
                {comments.data?.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-soft text-[10.5px] font-bold text-gold-ink">{initials(c.author_name)}</span>
                    <div className="min-w-0 flex-1 rounded-xl bg-ivory px-3 py-2">
                      <div className="text-[12px] text-muted"><b className="text-ink">{c.author_name}</b> · {dateTime(c.created_at)}</div>
                      <div className="text-[14px] whitespace-pre-wrap">{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) comment.mutate() }} className="mt-3 flex items-end gap-2">
                <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Izoh yozing…" aria-label="Izoh" />
                <Button type="submit" disabled={comment.isPending || !body.trim()} aria-label="Yuborish" className="!h-11 shrink-0"><Send size={16} /></Button>
              </form>
              <ErrorBox error={comment.error} />
            </div>
          </div>

          <aside className="space-y-3">
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-muted">Holat</div>
              <div className="grid grid-cols-2 gap-1.5">
                {COLUMNS.map((c) => (
                  <button key={c.key} type="button" disabled={!(manage || mine) || setStatus.isPending} onClick={() => setStatus.mutate(c.key)}
                    className={cn('flex min-h-10 items-center gap-1.5 rounded-xl border px-2.5 text-[12.5px] font-semibold disabled:opacity-50',
                      t.status === c.key ? 'border-ink bg-ink text-ivory' : 'border-line bg-white hover:border-ink')}>
                    <span className={cn('h-2 w-2 rounded-full', c.dot)} />{c.title}
                  </button>
                ))}
              </div>
              <ErrorBox error={setStatus.error} />
            </div>
            {manage ? (
              <>
                <Field label="Kimga">
                  <Select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
                    <option value="">Biriktirilmagan</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label="Muddat"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
                <Field label="Muhimlik">
                  <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="low">Past</option><option value="normal">Oddiy</option><option value="high">Muhim</option>
                  </Select>
                </Field>
                <ErrorBox error={save.error} />
                <Button className="w-full" disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isSuccess && !changed ? 'Saqlandi ✓' : 'Saqlash'}</Button>
                {t.status !== 'cancelled' && (
                  <Button variant="ghost" className="w-full" disabled={setStatus.isPending}
                    onClick={() => { if (window.confirm('Vazifa bekor qilinsinmi?')) setStatus.mutate('cancelled', { onSuccess: onClose }) }}>Bekor qilish</Button>
                )}
              </>
            ) : (
              <dl className="space-y-2 text-[13.5px]">
                <div><dt className="text-[12px] text-muted">Kimga</dt><dd className="font-semibold">{t.assignee_name ?? 'Biriktirilmagan'}</dd></div>
                <div><dt className="text-[12px] text-muted">Muddat</dt><dd className={cn('num font-semibold', t.is_overdue && 'text-bad')}>{date(t.due_date)}</dd></div>
                {t.priority === 'high' && <Badge tone="bad">Muhim</Badge>}
              </dl>
            )}
          </aside>
        </div>
      )}
    </Modal>
  )
}

function CreateTask({ onClose, project: initialProject = '', status = 'todo', assignee = '', people }: { onClose: () => void; project?: string; status?: string; assignee?: string; people: Person[] }) {
  const queryClient = useQueryClient()
  const projects = useActiveProjects()
  const [form, setForm] = useState({ project: initialProject, title: '', description: '', assignee, due_date: today(), priority: 'normal' })
  const create = useMutation({
    mutationFn: () => post('/tasks/', { ...form, status, project: Number(form.project), assignee: form.assignee ? Number(form.assignee) : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); onClose() },
  })
  return (
    <Modal title="Yangi vazifa" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <Field label="Vazifa"><Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Reels uchun ssenariy" required /></Field>
        <Field label="Mijoz">
          <Select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} required>
            <option value="">Tanlang…</option>
            {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name} · {p.tariff_name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kimga">
            <Select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
              <option value="">—</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Muddat"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        </div>
        <Field label="Tafsilot"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ixtiyoriy" /></Field>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={form.priority === 'high'} onChange={(e) => setForm({ ...form, priority: e.target.checked ? 'high' : 'normal' })} className="h-4 w-4 accent-[#c62828]" />
          Muhim vazifa
        </label>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>Vazifani berish</Button>
        <p className="text-center text-[12px] text-muted">Ishchiga panelda va Telegram’da xabar boradi</p>
      </form>
    </Modal>
  )
}
