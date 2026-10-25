import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { get, post } from '../../shared/api/client'
import type { Page, WorkLogEntry } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, today } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea } from '../../shared/ui'
import { useActiveProjects } from './Content'

export const WORK_KINDS: [string, string][] = [['shooting', 'Suratga olish'], ['editing', 'Montaj'], ['design', 'Dizayn'], ['publishing', 'Joylash'],
  ['stories', 'Stories'], ['target', 'Target reklama'], ['script', 'Ssenariy / matn'], ['report', 'Hisobot / tahlil'], ['meeting', 'Uchrashuv'], ['other', 'Boshqa']]

export function WorklogPage() {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const approver = can('worklog.approve')
  const list = useQuery({ queryKey: ['worklog'], queryFn: () => get<Page<WorkLogEntry>>('/worklog/', { page_size: 200 }) })
  const pending = useQuery({ queryKey: ['worklog', 'pending'], queryFn: () => get<WorkLogEntry[]>('/worklog/pending/'), enabled: approver })
  const review = useMutation({
    mutationFn: ({ id, ok }: { id: number; ok: boolean }) => post(`/worklog/${id}/${ok ? 'approve' : 'reject'}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worklog'] }),
  })
  const byDate = new Map<string, WorkLogEntry[]>()
  list.data?.results.forEach((e) => byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]))

  return (
    <>
      <PageHeader title="Kunlik ish jurnali" subtitle="Ko‘p yozuvlar o‘zi paydo bo‘ladi: vazifa bajarilganda, versiya yuklanganda, kontent joylanganda."
        actions={<Button onClick={() => setAdding(true)}><Plus size={16} />Qo‘lda qo‘shish</Button>} />
      {approver && !!pending.data?.length && (
        <Card className="mb-4 border-gold">
          <Kicker>Tekshiruv kutmoqda · {pending.data.length}</Kicker>
          {pending.data.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border-b border-line-soft py-2 last:border-0">
              <div className="min-w-0 flex-1"><div className="font-semibold">{e.title}</div><div className="text-[12px] text-muted">{e.user_name} · {e.client_name} · {date(e.date)}</div></div>
              <Button variant="ghost" onClick={() => review.mutate({ id: e.id, ok: false })} aria-label="Rad etish"><X size={15} /></Button>
              <Button onClick={() => review.mutate({ id: e.id, ok: true })}><Check size={15} />Mijozga ochish</Button>
            </div>
          ))}
        </Card>
      )}
      {list.isLoading && <Spinner />}
      {list.data?.results.length === 0 && <Empty title="Yozuv yo‘q" />}
      <div className="space-y-4">
        {[...byDate.entries()].map(([day, entries]) => (
          <Card key={day}>
            <Kicker>{date(day)}</Kicker>
            {entries.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 border-b border-line-soft py-2 last:border-0">
                <Badge tone="draft">{e.kind_label}</Badge>
                <span className="min-w-0 flex-1 font-semibold">{e.title}{e.quantity > 1 && <span className="num text-muted"> ×{e.quantity}</span>}</span>
                <span className="text-[12px] text-muted">{e.user_name} · {e.client_name} · {e.source_label}</span>
                <StatusBadge status={e.status} label={e.status_label} />
              </div>
            ))}
          </Card>
        ))}
      </div>
      {adding && <AddEntry onClose={() => setAdding(false)} />}
    </>
  )
}

function AddEntry({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const projects = useActiveProjects()
  const [form, setForm] = useState({ project: '', date: today(), kind: 'other', quantity: '1', title: '', link: '', internal_note: '' })
  const create = useMutation({
    mutationFn: () => post('/worklog/', { ...form, project: Number(form.project), quantity: Number(form.quantity) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['worklog'] }); onClose() },
  })
  return (
    <Modal title="Ish jurnaliga yozuv" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <Field label="Mijoz">
          <Select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} required>
            <option value="">Tanlang…</option>
            {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sana"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Turi"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{WORK_KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Soni"><Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
        </div>
        <Field label="Nima qilindi" hint="Mijoz shu matnni ko‘radi — aniq va sodda yozing"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Havola (ixtiyoriy)"><Input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></Field>
        <Field label="Ichki izoh (mijozga ko‘rinmaydi)"><Textarea value={form.internal_note} onChange={(e) => setForm({ ...form, internal_note: e.target.value })} /></Field>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>Saqlash</Button>
      </form>
    </Modal>
  )
}
