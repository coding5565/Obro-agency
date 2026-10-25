import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { get, post } from '../../shared/api/client'
import type { Expense, ExpenseCategory, Invoice, Page, Payment } from '../../shared/api/types'
import { date, money, monthKey, monthLabel, shiftMonth, today } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, Stat, StatusBadge, Table, Tabs } from '../../shared/ui'

type Tab = 'invoices' | 'payments' | 'expenses' | 'summary' | 'rates'

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('invoices')
  return (
    <>
      <PageHeader title="Moliya" />
      <Tabs value={tab} onChange={setTab} items={[['invoices', 'Hisob-fakturalar'], ['payments', 'To‘lovlar'], ['expenses', 'Xarajatlar'], ['summary', 'Oylik foyda'], ['rates', 'Kurs']]} />
      {tab === 'invoices' && <Invoices />}
      {tab === 'payments' && <Payments />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'summary' && <Summary />}
      {tab === 'rates' && <Rates />}
    </>
  )
}

function Invoices() {
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState<Invoice | null>(null)
  const list = useQuery({ queryKey: ['invoices'], queryFn: () => get<Page<Invoice>>('/finance/invoices/', { page_size: 200 }) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoices'] })
  const generate = useMutation({ mutationFn: () => post<{ created: number }>('/finance/invoices/generate/'), onSuccess: refresh })
  const issue = useMutation({ mutationFn: (id: number) => post(`/finance/invoices/${id}/issue/`), onSuccess: refresh })
  const cancel = useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/finance/invoices/${id}/cancel/`, { reason }), onSuccess: refresh })
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button variant="dark" onClick={() => generate.mutate()} disabled={generate.isPending}><RefreshCw size={15} />Yangi davrlar uchun qoralama</Button>
        {generate.data && <span className="text-[13px] text-muted">{generate.data.created} ta yangi qoralama yaratildi</span>}
      </div>
      <ErrorBox error={generate.error || issue.error || cancel.error} />
      {list.isLoading ? <Spinner /> : list.data?.results.length === 0 ? <Empty title="Hisob-faktura yo‘q" hint="Loyiha ochilgach «Yangi davrlar uchun qoralama» tugmasini bosing." /> : (
        <Table head={['Raqam', 'Mijoz', 'Davr', 'Summa', 'To‘langan', 'Muddat', 'Holat', '']}>
          {list.data?.results.map((inv) => (
            <tr key={inv.id}>
              <td className="num">{inv.number}</td>
              <td><div className="font-semibold">{inv.client_name}</div><div className="text-[12px] text-muted">{inv.tariff_name}</div></td>
              <td className="num text-[12px]">{date(inv.period_start)}–{date(inv.period_end)}</td>
              <td className="num">{money(inv.total, inv.currency)}</td>
              <td className="num">{money(inv.paid_amount, inv.currency)}</td>
              <td className="num">{date(inv.due_date)}</td>
              <td><StatusBadge status={inv.status} label={inv.status_label} /></td>
              <td className="whitespace-nowrap text-right">
                {inv.status === 'draft' && <Button onClick={() => issue.mutate(inv.id)}>Chiqarish</Button>}
                {['open', 'partial', 'overdue'].includes(inv.status) && <Button onClick={() => setPaying(inv)}>To‘lov</Button>}{' '}
                {['draft', 'open', 'overdue'].includes(inv.status) && Number(inv.paid_amount) === 0 && (
                  <Button variant="ghost" onClick={() => { const reason = prompt('Bekor qilish sababi'); if (reason) cancel.mutate({ id: inv.id, reason }) }}>Bekor</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {paying && <PaymentForm invoice={paying} onClose={() => setPaying(null)} />}
    </>
  )
}

function PaymentForm({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ amount: invoice.outstanding, rate_to_uzs: '', method: 'cash', paid_on: today(), note: '' })
  const save = useMutation({
    mutationFn: () => post('/finance/payments/', { ...form, client: invoice.client_id, invoice: invoice.id, currency: invoice.currency, rate_to_uzs: form.rate_to_uzs || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      onClose()
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title={`To‘lov · ${invoice.client_name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <p className="text-[13px] text-muted">{invoice.number} · qoldiq {money(invoice.outstanding, invoice.currency)}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Summa (${invoice.currency})`}><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required /></Field>
          <Field label="Sana"><Input type="date" value={form.paid_on} onChange={set('paid_on')} required /></Field>
        </div>
        {invoice.currency === 'USD' && (
          <Field label="Kurs (1$ = so‘m)" hint="Bo‘sh qoldirsangiz, «Kurs» bo‘limidagi shu kungi kurs olinadi. Kurs qotiriladi va maosh shu kurs bilan hisoblanadi.">
            <Input type="number" step="0.01" value={form.rate_to_uzs} onChange={set('rate_to_uzs')} />
          </Field>
        )}
        <Field label="Usul">
          <Select value={form.method} onChange={set('method')}>
            <option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">Bank o‘tkazmasi</option><option value="click">Click</option><option value="payme">Payme</option>
          </Select>
        </Field>
        <Field label="Izoh"><Input value={form.note} onChange={set('note')} /></Field>
        <p className="text-[12px] text-muted">Saqlanganda loyihaga biriktirilgan xodimlarga ulush avtomatik yoziladi.</p>
        <ErrorBox error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>To‘lovni qayd etish</Button>
      </form>
    </Modal>
  )
}

function Payments() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['payments'], queryFn: () => get<Page<Payment>>('/finance/payments/', { page_size: 200 }) })
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/finance/payments/${id}/cancel/`, { reason }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments'] }); queryClient.invalidateQueries({ queryKey: ['invoices'] }) },
  })
  return (
    <>
      <ErrorBox error={cancel.error} />
      {list.data?.results.length === 0 && <Empty title="To‘lov yo‘q" />}
      {!!list.data?.results.length && (
        <Table head={['Sana', 'Mijoz', 'Summa', 'So‘mda', 'Usul', 'Hisob-faktura', '']}>
          {list.data.results.map((p) => (
            <tr key={p.id} className={p.cancelled_at ? 'opacity-50' : ''}>
              <td className="num">{date(p.paid_on)}</td>
              <td className="font-semibold">{p.client_name}</td>
              <td className="num">{money(p.amount, p.currency)}{p.currency === 'USD' && <div className="text-[11px] text-muted">kurs {p.rate_to_uzs}</div>}</td>
              <td className="num">{money(p.amount_uzs)}</td>
              <td>{p.method_label}</td>
              <td className="num text-[12px]">{p.allocations.map((a) => a.invoice_number).join(', ')}{Number(p.unallocated_amount) > 0 && <div><Badge tone="info">avans {money(p.unallocated_amount, p.currency)}</Badge></div>}</td>
              <td className="text-right">
                {p.cancelled_at ? <Badge>Bekor: {p.cancel_reason}</Badge> : (
                  <Button variant="ghost" onClick={() => { const reason = prompt('Bekor qilish sababi'); if (reason) cancel.mutate({ id: p.id, reason }) }}>Bekor</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

function Expenses() {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const list = useQuery({ queryKey: ['expenses'], queryFn: () => get<Page<Expense>>('/finance/expenses/', { page_size: 200 }) })
  const review = useMutation({
    mutationFn: ({ id, ok }: { id: number; ok: boolean }) => post(`/finance/expenses/${id}/${ok ? 'approve' : 'reject'}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })
  return (
    <>
      <Button className="mb-3" onClick={() => setAdding(true)}><Plus size={15} />Xarajat</Button>
      {list.data?.results.length === 0 && <Empty title="Xarajat yo‘q" />}
      {!!list.data?.results.length && (
        <Table head={['Sana', 'Kategoriya', 'Tavsif', 'Summa', 'Holat', '']}>
          {list.data.results.map((e) => (
            <tr key={e.id} className={e.cancelled_at ? 'opacity-50' : ''}>
              <td className="num">{date(e.spent_on)}</td>
              <td>{e.category_name}</td>
              <td>{e.description}<div className="text-[12px] text-muted">{e.created_by_name}</div></td>
              <td className="num">{money(e.amount, e.currency)}</td>
              <td><StatusBadge status={e.status} label={e.status_label} /></td>
              <td className="whitespace-nowrap text-right">
                {e.status === 'requested' && <><Button variant="ghost" onClick={() => review.mutate({ id: e.id, ok: false })}>Rad</Button> <Button onClick={() => review.mutate({ id: e.id, ok: true })}>Tasdiqlash</Button></>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <ExpenseForm onClose={() => setAdding(false)} />}
    </>
  )
}

export function ExpenseForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => get<ExpenseCategory[]>('/finance/expense-categories/') })
  const [form, setForm] = useState({ category: '', amount: '', currency: 'UZS', rate_to_uzs: '', spent_on: today(), description: '' })
  const save = useMutation({
    mutationFn: () => post('/finance/expenses/', { ...form, category: Number(form.category || categories.data?.[0]?.id), rate_to_uzs: form.rate_to_uzs || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); onClose() },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title="Xarajat" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <Field label="Kategoriya"><Select value={form.category} onChange={set('category')}>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="Summa"><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required /></Field></div>
          <Field label="Valyuta"><Select value={form.currency} onChange={set('currency')}><option>UZS</option><option>USD</option></Select></Field>
        </div>
        <Field label="Sana"><Input type="date" value={form.spent_on} onChange={set('spent_on')} /></Field>
        <Field label="Tavsif"><Input value={form.description} onChange={set('description')} required /></Field>
        <ErrorBox error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Saqlash</Button>
      </form>
    </Modal>
  )
}

interface Summary {
  income_uzs: string; transit_uzs: string; own_income_uzs: string; team_share_uzs: string; expenses_uzs: string
  expenses_by_category: { category: string; amount_uzs: string }[]; profit_uzs: string; per_partner_uzs: string; is_closed: boolean
}

function Summary() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(monthKey())
  const data = useQuery({ queryKey: ['summary', month], queryFn: () => get<Summary>('/finance/summary/', { month }) })
  const close = useMutation({ mutationFn: () => post('/finance/close-month/', { month }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['summary', month] }) })
  const s = data.data
  const round = (v: string) => money(Math.round(Number(v)))
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-line bg-white">
          <button className="p-2" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Oldingi oy"><ChevronLeft size={16} /></button>
          <span className="min-w-[120px] text-center font-semibold">{monthLabel(month)}</span>
          <button className="p-2" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Keyingi oy"><ChevronRight size={16} /></button>
        </div>
        {s && (s.is_closed ? <Badge tone="dark">Oy yopilgan</Badge> : <Button variant="ghost" onClick={() => confirm('Oyni yopsangiz, undagi to‘lov va xarajatlarni faqat rahbar o‘zgartiradi. Yopilsinmi?') && close.mutate()}>Oyni yopish</Button>)}
      </div>
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tushum" value={round(s.own_income_uzs)} hint={Number(s.transit_uzs) ? `+ tranzit ${round(s.transit_uzs)}` : undefined} />
            <Stat label="Jamoa ulushi" value={round(s.team_share_uzs)} />
            <Stat label="Xarajatlar" value={round(s.expenses_uzs)} />
            <Stat label="Sof foyda" value={<span className={Number(s.profit_uzs) < 0 ? 'text-bad' : ''}>{round(s.profit_uzs)}</span>} hint={`Har sherikka ${round(s.per_partner_uzs)}`} />
          </div>
          <Card className="mt-4">
            <Kicker>Xarajatlar kategoriya bo‘yicha</Kicker>
            {s.expenses_by_category.length === 0 && <div className="text-muted">Xarajat yo‘q</div>}
            {s.expenses_by_category.map((c) => <div key={c.category} className="flex justify-between border-b border-line-soft py-1.5 last:border-0"><span>{c.category}</span><span className="num">{round(c.amount_uzs)}</span></div>)}
          </Card>
        </>
      )}
    </>
  )
}

function Rates() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['rates'], queryFn: () => get<Page<{ id: number; date: string; currency: string; rate_to_uzs: string }>>('/finance/rates/') })
  const [form, setForm] = useState({ date: today(), rate_to_uzs: '' })
  const save = useMutation({ mutationFn: () => post('/finance/rates/', { ...form, currency: 'USD', source: 'manual' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rates'] }) })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Kicker>Dollar kursi (Markaziy bank)</Kicker>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="flex flex-wrap items-end gap-2">
          <Field label="Sana"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="1$ = so‘m"><Input type="number" step="0.01" value={form.rate_to_uzs} onChange={(e) => setForm({ ...form, rate_to_uzs: e.target.value })} required /></Field>
          <Button type="submit">Saqlash</Button>
        </form>
        <ErrorBox error={save.error} />
        <p className="mt-2 text-[12px] text-muted">Keyingi bosqichda kurs cbu.uz’dan har kuni avtomatik olinadi.</p>
      </Card>
      <Table head={['Sana', 'Kurs']}>
        {list.data?.results.map((r) => <tr key={r.id}><td className="num">{date(r.date)}</td><td className="num">{money(r.rate_to_uzs)}</td></tr>)}
      </Table>
    </div>
  )
}
