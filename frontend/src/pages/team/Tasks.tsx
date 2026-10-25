import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { get, post } from '../../shared/api/client'
import type { Page, StaffUser, Task } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, today } from '../../shared/lib/format'
import { Badge, Button, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Textarea } from '../../shared/ui'
import { useActiveProjects } from './Content'

export function TasksPage() {
  const { user, can } = useAuth()
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [status, setStatus] = useState('open')
  const [creating, setCreating] = useState(false)
  const list = useQuery({
    queryKey: ['tasks', scope, status],
    queryFn: () => get<Page<Task>>('/tasks/', {
      assignee: scope === 'mine' ? user?.id : undefined,
      status: status === 'open' ? undefined : status,
      page_size: 300,
    }),
  })
  const change = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => post(`/tasks/${id}/set-status/`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
  const rows = (list.data?.results ?? []).filter((t) => status !== 'open' || ['todo', 'in_progress'].includes(t.status))
  return (
    <>
      <PageHeader title="Vazifalar" actions={can('tasks.manage') && <Button onClick={() => setCreating(true)}><Plus size={16} />Vazifa</Button>} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={scope} onChange={setScope} items={[['mine', 'Menga'], ['all', 'Hammasi']]} />
        <Tabs value={status} onChange={setStatus} items={[['open', 'Ochiq'], ['done', 'Bajarilgan'], ['cancelled', 'Bekor']]} />
      </div>
      <ErrorBox error={change.error} />
      {list.isLoading ? <Spinner /> : rows.length === 0 ? <Empty title="Vazifa yo‘q" /> : (
        <Table head={['Vazifa', 'Mijoz', 'Kimga', 'Muddat', 'Holat', '']}>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="font-semibold">{t.title}</div>
                {t.content_item && <Link to={`/app/content/${t.content_item}`} className="text-[12px] text-bronze">Kontentni ochish →</Link>}
                {t.description && <div className="text-[12px] text-muted">{t.description}</div>}
              </td>
              <td>{t.client_name}</td>
              <td>{t.assignee_name ?? <span className="text-muted">—</span>}</td>
              <td>{t.is_overdue ? <Badge tone="bad">{date(t.due_date)}</Badge> : <span className="num">{date(t.due_date)}</span>}</td>
              <td><StatusBadge status={t.status} label={t.status_label} /></td>
              <td className="whitespace-nowrap text-right">
                {t.status === 'todo' && <Button variant="ghost" onClick={() => change.mutate({ id: t.id, status: 'in_progress' })}>Boshlash</Button>}{' '}
                {['todo', 'in_progress'].includes(t.status) && <Button onClick={() => change.mutate({ id: t.id, status: 'done' })}>Bajarildi</Button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <CreateTask onClose={() => setCreating(false)} />}
    </>
  )
}

function CreateTask({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const projects = useActiveProjects()
  const users = useQuery({ queryKey: ['users', 'staff'], queryFn: () => get<Page<StaffUser>>('/users/', { staff: 1, page_size: 200 }), retry: false })
  const [form, setForm] = useState({ project: '', title: '', description: '', assignee: '', due_date: today(), priority: 'normal' })
  const project = projects.data?.results.find((p) => String(p.id) === form.project)
  // Rahbar barcha xodimlarni ko'radi, SMM menejer — loyihaga biriktirilganlarni.
  const people = users.data?.results.map((u) => ({ id: u.id, name: u.full_name }))
    ?? project?.assignments.map((a) => ({ id: a.user, name: a.user_name })) ?? []
  const create = useMutation({
    mutationFn: () => post('/tasks/', { ...form, project: Number(form.project), assignee: form.assignee ? Number(form.assignee) : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); onClose() },
  })
  return (
    <Modal title="Yangi vazifa" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <Field label="Loyiha">
          <Select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} required>
            <option value="">Tanlang…</option>
            {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name} · {p.tariff_name}</option>)}
          </Select>
        </Field>
        <Field label="Vazifa"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Tafsilot"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kimga">
            <Select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
              <option value="">—</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Muddat"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        </div>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>Saqlash</Button>
      </form>
    </Modal>
  )
}
