import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Download, FileText, Paperclip, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, downloadFile, get, post, upload } from '../../shared/api/client'
import type { Client, Expense, ExpenseCategory, Invoice, Page, Payment } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, money, monthKey, rate, today } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Tabs } from '../../shared/ui'
import { useActiveProjects } from './Content'
import { AccountField, useCashAccounts } from './financeShared'
import { Accounts, Partners, SettingsTab } from './FinanceMoney'
import { Report } from './FinanceReport'
import { MonthPicker } from './Payroll'

type Tab = 'invoices' | 'payments' | 'expenses' | 'debts' | 'accounts' | 'report' | 'partners' | 'rates' | 'settings'

export function FinancePage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const reports = can('reports.agency')
  const items: [Tab, string][] = [
    ['invoices', 'Hisob-fakturalar'], ['payments', 'To‘lovlar'], ['expenses', 'Xarajatlar'], ['debts', 'Qarzdorlar'], ['accounts', 'Hisoblar'],
    ...(reports ? ([['report', 'Foyda va hisobot'], ['partners', 'Sheriklar']] as [Tab, string][]) : []),
    ['rates', 'Kurs'], ['settings', 'Sozlamalar'],
  ]
  const wanted = params.get('tab') as Tab | null
  const tab = items.some(([key]) => key === wanted) ? (wanted as Tab) : 'invoices'
  return (
    <>
      <PageHeader title="Moliya" />
      <Tabs value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} items={items} />
      {tab === 'invoices' && <Invoices />}
      {tab === 'payments' && <Payments />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'debts' && <Debts />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'report' && <Report />}
      {tab === 'partners' && <Partners />}
      {tab === 'rates' && <Rates />}
      {tab === 'settings' && <SettingsTab />}
    </>
  )
}

function Invoices() {
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [state, setState] = useState('')
  const list = useQuery({ queryKey: ['invoices', state], queryFn: () => get<Page<Invoice>>('/finance/invoices/', { page_size: 200, state }) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoices'] })
  const generate = useMutation({ mutationFn: () => post<{ created: number }>('/finance/invoices/generate/'), onSuccess: refresh })
  const issue = useMutation({ mutationFn: (id: number) => post(`/finance/invoices/${id}/issue/`), onSuccess: refresh })
  const cancel = useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/finance/invoices/${id}/cancel/`, { reason }), onSuccess: refresh })
  const open = list.data?.results.find((inv) => inv.id === openId)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button variant="dark" onClick={() => generate.mutate()} disabled={generate.isPending}><RefreshCw size={15} />Yangi davrlar uchun qoralama</Button>
        <Select value={state} onChange={(e) => setState(e.target.value)} className="max-w-[170px]" aria-label="Holat">
          <option value="">Hammasi</option><option value="draft">Qoralamalar</option><option value="open">Chiqarilgan</option>
        </Select>
        {generate.data && <span className="text-[13px] text-muted">{generate.data.created} ta yangi qoralama yaratildi</span>}
      </div>
      <ErrorBox error={generate.error || issue.error || cancel.error} />
      {list.isLoading ? <Spinner /> : list.data?.results.length === 0 ? <Empty title="Hisob-faktura yo‘q" hint="Loyiha ochilgach «Yangi davrlar uchun qoralama» tugmasini bosing." /> : (
        <Table head={['Raqam', 'Mijoz', 'Davr', 'Summa', 'To‘langan', 'Muddat', 'Holat', '']}>
          {list.data?.results.map((inv) => (
            <tr key={inv.id}>
              <td className="num"><button className="font-semibold text-bronze hover:underline" onClick={() => setOpenId(inv.id)}>{inv.number}</button></td>
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
      {open && <InvoiceModal invoice={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

const LINE_KINDS: [string, string][] = [['service', 'Qo‘shimcha xizmat'], ['transit', 'Tranzit (reklama budjeti)'], ['tariff', 'Tarif']]

function InvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const queryClient = useQueryClient()
  const draft = !invoice.issued_at && invoice.status === 'draft'
  const [form, setForm] = useState({ kind: 'service', description: '', quantity: '1', unit_price: '' })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoices'] })
  const add = useMutation({
    mutationFn: () => post(`/finance/invoices/${invoice.id}/lines/`, form),
    onSuccess: () => { refresh(); setForm({ ...form, description: '', unit_price: '' }) },
  })
  const remove = useMutation({
    mutationFn: (line: number) => api(`/finance/invoices/${invoice.id}/lines/${line}/`, { method: 'DELETE' }),
    onSuccess: refresh,
  })
  return (
    <Modal title={`${invoice.number} · ${invoice.client_name}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <StatusBadge status={invoice.status} label={invoice.status_label} />
        {date(invoice.period_start)}–{date(invoice.period_end)} · muddat {date(invoice.due_date)}
      </div>
      <div className="divide-y divide-line-soft">
        {invoice.lines.map((line) => (
          <div key={line.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{line.description}</div>
              <div className="num text-[12px] text-muted">{Number(line.quantity)} × {money(line.unit_price, invoice.currency)}</div>
            </div>
            <span className="num font-bold">{money(line.amount, invoice.currency)}</span>
            {draft && <Button variant="ghost" aria-label="Qatorni o‘chirish" disabled={remove.isPending} onClick={() => remove.mutate(line.id)}><Trash2 size={15} /></Button>}
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1 border-t border-line pt-3 text-[14px]">
        <div className="flex justify-between font-bold"><span>Jami</span><span className="num">{money(invoice.total, invoice.currency)}</span></div>
        {Number(invoice.transit_total) > 0 && <div className="flex justify-between text-muted"><span>Shundan tranzit</span><span className="num">{money(invoice.transit_total, invoice.currency)}</span></div>}
        <div className="flex justify-between"><span>To‘langan</span><span className="num">{money(invoice.paid_amount, invoice.currency)}</span></div>
        <div className="flex justify-between"><span>Qoldiq</span><span className="num">{money(invoice.outstanding, invoice.currency)}</span></div>
      </div>
      <ErrorBox error={add.error || remove.error} />
      {draft ? (
        <form className="mt-4 space-y-2 border-t border-line-soft pt-3" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
          <Kicker>Qator qo‘shish</Kicker>
          <Field label="Turi"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{LINE_KINDS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
          <Field label="Tavsif"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Soni"><Input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></Field>
            <Field label={`Narxi (${invoice.currency})`}><Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} required /></Field>
          </div>
          <Button disabled={add.isPending}><Plus size={15} />Qo‘shish</Button>
        </form>
      ) : <p className="mt-3 text-[12.5px] text-muted">Chiqarilgan hisob-faktura o‘zgartirilmaydi.</p>}
    </Modal>
  )
}

function PaymentForm({ invoice, onClose }: { invoice?: Invoice; onClose: () => void }) {
  const queryClient = useQueryClient()
  const accounts = useCashAccounts()
  const clients = useQuery({ queryKey: ['clients', 'all'], queryFn: () => get<Page<Client>>('/clients/', { page_size: 300 }), enabled: !invoice })
  const [form, setForm] = useState({ client: '', currency: 'USD', amount: invoice?.outstanding ?? '', rate_to_uzs: '', method: 'cash', account: '', paid_on: today(), note: '' })
  const currency = invoice?.currency ?? form.currency
  const save = useMutation({
    mutationFn: () => post('/finance/payments/', {
      amount: form.amount, method: form.method, paid_on: form.paid_on, note: form.note, currency,
      client: invoice?.client_id ?? Number(form.client), invoice: invoice?.id ?? null,
      rate_to_uzs: form.rate_to_uzs || null, account: form.account ? Number(form.account) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
      onClose()
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title={invoice ? `To‘lov · ${invoice.client_name}` : 'Yangi to‘lov'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        {invoice ? <p className="text-[13px] text-muted">{invoice.number} · qoldiq {money(invoice.outstanding, invoice.currency)}</p> : (
          <>
            <Field label="Mijoz"><Select value={form.client} onChange={set('client')} required><option value="">Tanlang…</option>{clients.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <p className="text-[12.5px] text-muted">Pul eng eski ochiq hisob-fakturaga tushadi. Ortgani avans bo‘lib qoladi.</p>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Summa (${currency})`}><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required /></Field>
          {invoice
            ? <Field label="Sana"><Input type="date" value={form.paid_on} onChange={set('paid_on')} required /></Field>
            : <Field label="Valyuta"><Select value={form.currency} onChange={set('currency')}><option>USD</option><option>UZS</option></Select></Field>}
        </div>
        {!invoice && <Field label="Sana"><Input type="date" value={form.paid_on} onChange={set('paid_on')} required /></Field>}
        {currency === 'USD' && (
          <Field label="Kurs (1$ = so‘m)" hint="Bo‘sh qoldirsangiz, «Kurs» bo‘limidagi shu kungi kurs olinadi. Kurs qotiriladi va maosh shu kurs bilan hisoblanadi.">
            <Input type="number" step="0.01" value={form.rate_to_uzs} onChange={set('rate_to_uzs')} />
          </Field>
        )}
        <Field label="Usul">
          <Select value={form.method} onChange={set('method')}>
            <option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">Bank o‘tkazmasi</option><option value="click">Click</option><option value="payme">Payme</option>
          </Select>
        </Field>
        <AccountField accounts={accounts.data} currency={currency} value={form.account} onChange={set('account')} label="Qaysi hisobga tushdi" />
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
  const { can } = useAuth()
  const [month, setMonth] = useState(monthKey())
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const list = useQuery({ queryKey: ['payments', month], queryFn: () => get<Page<Payment>>('/finance/payments/', { page_size: 300, month }) })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] })
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
  }
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/finance/payments/${id}/cancel/`, { reason }),
    onSuccess: refresh,
  })
  const allocate = useMutation({
    mutationFn: (payment: Payment) => post<Payment>(`/finance/payments/${payment.id}/allocate-advance/`),
    onSuccess: (updated, payment) => {
      setNotice(updated.unallocated_amount === payment.unallocated_amount
        ? `${payment.client_name}: ochiq hisob-faktura yo‘q. Avval yangi davr hisob-fakturasini chiqaring.`
        : `${payment.client_name}: avans hisob-fakturaga o‘tkazildi, qoldiq ${money(updated.unallocated_amount, updated.currency)}.`)
      refresh()
    },
  })
  const active = list.data?.results.filter((p) => !p.cancelled_at) ?? []
  const total = active.reduce((sum, p) => sum + Number(p.amount_uzs), 0)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <Button onClick={() => setAdding(true)}><Plus size={15} />To‘lov</Button>
        {can('reports.agency') && <Button variant="ghost" onClick={() => downloadFile('/finance/export/payments/', `tolovlar-${month}.csv`, { month })}><Download size={15} />CSV</Button>}
        <span className="text-muted">Jami: <b className="num text-ink">{money(Math.round(total))}</b></span>
      </div>
      <ErrorBox error={list.error || cancel.error || allocate.error} />
      {notice && <div className="mb-3 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[13.5px] font-semibold">{notice}</div>}
      {list.isLoading ? <Spinner /> : list.data?.results.length === 0 ? <Empty title="Bu oy to‘lov yo‘q" /> : (
        <Table head={['Sana', 'Mijoz', 'Summa', 'So‘mda', 'Usul', 'Hisob-faktura', '']}>
          {list.data?.results.map((p) => (
            <tr key={p.id} className={p.cancelled_at ? 'opacity-50' : ''}>
              <td className="num">{date(p.paid_on)}</td>
              <td className="font-semibold">{p.client_name}</td>
              <td className="num">{money(p.amount, p.currency)}{p.currency === 'USD' && <div className="text-[11px] text-muted">kurs {rate(p.rate_to_uzs)}</div>}</td>
              <td className="num">{money(p.amount_uzs)}</td>
              <td>{p.method_label}{p.account_name && <div className="text-[12px] text-muted">{p.account_name}</div>}</td>
              <td className="num text-[12px]">{p.allocations.map((a) => a.invoice_number).join(', ')}{Number(p.unallocated_amount) > 0 && <div><Badge tone="info">avans {money(p.unallocated_amount, p.currency)}</Badge></div>}</td>
              <td className="whitespace-nowrap text-right">
                {p.cancelled_at ? <Badge>Bekor: {p.cancel_reason}</Badge> : (
                  <>
                    {Number(p.unallocated_amount) > 0 && <Button disabled={allocate.isPending} onClick={() => allocate.mutate(p)}>Avansni taqsimlash</Button>}{' '}
                    <Button variant="ghost" onClick={() => { const reason = prompt('Bekor qilish sababi'); if (reason) cancel.mutate({ id: p.id, reason }) }}>Bekor</Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <PaymentForm onClose={() => setAdding(false)} />}
    </>
  )
}

function Expenses() {
  const queryClient = useQueryClient()
  const { can } = useAuth()
  const [adding, setAdding] = useState(false)
  const [month, setMonth] = useState(monthKey())
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => get<ExpenseCategory[]>('/finance/expense-categories/') })
  const list = useQuery({ queryKey: ['expenses', month, status, category], queryFn: () => get<Page<Expense>>('/finance/expenses/', { page_size: 300, month, status, category }) })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
    queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
    queryClient.invalidateQueries({ queryKey: ['report'] })
  }
  const review = useMutation({
    mutationFn: ({ id, ok }: { id: number; ok: boolean }) => post(`/finance/expenses/${id}/${ok ? 'approve' : 'reject'}/`),
    onSuccess: refresh,
  })
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/finance/expenses/${id}/cancel/`, { reason }),
    onSuccess: refresh,
  })
  const counted = list.data?.results.filter((e) => e.status === 'approved' && !e.cancelled_at) ?? []
  const total = counted.reduce((sum, e) => sum + Number(e.amount_uzs), 0)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[150px]" aria-label="Holat">
          <option value="">Barcha holat</option><option value="requested">So‘rovlar</option><option value="approved">Tasdiqlangan</option><option value="rejected">Rad etilgan</option>
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="max-w-[170px]" aria-label="Kategoriya">
          <option value="">Barcha kategoriya</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button onClick={() => setAdding(true)}><Plus size={15} />Xarajat</Button>
        {can('reports.agency') && <Button variant="ghost" onClick={() => downloadFile('/finance/export/expenses/', `xarajatlar-${month}.csv`, { month })}><Download size={15} />CSV</Button>}
        <span className="text-muted">Tasdiqlangan: <b className="num text-ink">{money(Math.round(total))}</b></span>
      </div>
      <ErrorBox error={list.error || review.error || cancel.error} />
      {list.isLoading ? <Spinner /> : list.data?.results.length === 0 ? <Empty title="Xarajat yo‘q" /> : (
        <Table head={['Sana', 'Kategoriya', 'Tavsif', 'Summa', 'Holat', '']}>
          {list.data?.results.map((e) => (
            <tr key={e.id} className={e.cancelled_at ? 'opacity-50' : ''}>
              <td className="num">{date(e.spent_on)}</td>
              <td>{e.category_name}</td>
              <td>
                {e.description}
                <div className="text-[12px] text-muted">{[e.created_by_name, e.client_name, e.account_name].filter(Boolean).join(' · ')}</div>
                {e.has_receipt && <button className="mt-0.5 inline-flex min-h-8 items-center gap-1 text-[12.5px] font-semibold text-bronze" onClick={() => downloadFile(`/finance/expenses/${e.id}/receipt/`, `chek-${e.id}`)}><Paperclip size={13} />Chek</button>}
              </td>
              <td className="num">{money(e.amount, e.currency)}</td>
              <td><StatusBadge status={e.status} label={e.status_label} /></td>
              <td className="whitespace-nowrap text-right">
                {e.cancelled_at ? <Badge>Bekor: {e.cancel_reason}</Badge> : (
                  <>
                    {e.status === 'requested' && <><Button variant="ghost" onClick={() => review.mutate({ id: e.id, ok: false })}>Rad</Button> <Button onClick={() => review.mutate({ id: e.id, ok: true })}>Tasdiqlash</Button></>}
                    {e.status === 'approved' && <Button variant="ghost" onClick={() => { const reason = prompt('Bekor qilish sababi'); if (reason) cancel.mutate({ id: e.id, reason }) }}>Bekor</Button>}
                  </>
                )}
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
  const { can } = useAuth()
  const manage = can('finance.manage')
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => get<ExpenseCategory[]>('/finance/expense-categories/') })
  const accounts = useCashAccounts(manage)
  const projects = useActiveProjects()
  const [form, setForm] = useState({ category: '', amount: '', currency: 'UZS', rate_to_uzs: '', spent_on: today(), description: '', account: '', project: '' })
  const [receipt, setReceipt] = useState<File | null>(null)
  const save = useMutation({
    mutationFn: () => {
      const data = new FormData()
      data.append('category', form.category || String(categories.data?.[0]?.id ?? ''))
      data.append('amount', form.amount)
      data.append('currency', form.currency)
      data.append('spent_on', form.spent_on)
      data.append('description', form.description)
      if (form.currency === 'USD' && form.rate_to_uzs) data.append('rate_to_uzs', form.rate_to_uzs)
      if (form.account) data.append('account', form.account)
      if (form.project) data.append('project', form.project)
      if (receipt) data.append('receipt', receipt)
      return upload('/finance/expenses/', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['report'] })
      onClose()
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title={manage ? 'Xarajat' : 'Xarajat so‘rovi'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <Field label="Kategoriya"><Select value={form.category} onChange={set('category')}>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="Summa"><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required /></Field></div>
          <Field label="Valyuta"><Select value={form.currency} onChange={set('currency')}><option>UZS</option><option>USD</option></Select></Field>
        </div>
        {form.currency === 'USD' && <Field label="Kurs (1$ = so‘m)" hint="Bo‘sh qoldirsangiz, shu kungi kurs olinadi."><Input type="number" step="0.01" value={form.rate_to_uzs} onChange={set('rate_to_uzs')} /></Field>}
        <Field label="Sana"><Input type="date" value={form.spent_on} onChange={set('spent_on')} /></Field>
        <AccountField accounts={accounts.data} currency={form.currency} value={form.account} onChange={set('account')} label="Qaysi hisobdan" />
        <Field label="Mijoz" hint="Bitta mijozga tegishli xarajat bo‘lsa, shu mijoz foydasidan ayriladi.">
          <Select value={form.project} onChange={set('project')}>
            <option value="">Umumiy xarajat</option>
            {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
          </Select>
        </Field>
        <Field label="Tavsif"><Input value={form.description} onChange={set('description')} required /></Field>
        <Field label="Chek (rasm yoki PDF, 10 MB gacha)"><Input type="file" accept="image/*,.pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} /></Field>
        {!manage && <p className="text-[12.5px] text-muted">So‘rov rahbar tasdiqlagach hisobga kiradi.</p>}
        <ErrorBox error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>{manage ? 'Saqlash' : 'So‘rov yuborish'}</Button>
      </form>
    </Modal>
  )
}

interface DebtRow { client_id: number; client_name: string; invoices: number; days_overdue: number; status: string; outstanding?: Record<string, string> }

function Debts() {
  const queryClient = useQueryClient()
  const debts = useQuery({ queryKey: ['debts'], queryFn: () => get<DebtRow[]>('/finance/debts/') })
  const invoices = useQuery({ queryKey: ['invoices', 'open'], queryFn: () => get<Page<Invoice>>('/finance/invoices/', { page_size: 300, state: 'open' }) })
  const [sent, setSent] = useState('')
  const remind = useMutation({
    mutationFn: async (row: DebtRow) => {
      const own = invoices.data?.results.filter((inv) => inv.client_id === row.client_id && Number(inv.outstanding) > 0) ?? []
      const results = await Promise.all(own.map((inv) => post<{ sent: number }>(`/finance/invoices/${inv.id}/remind/`)))
      return { row, sent: results.reduce((sum, r) => sum + r.sent, 0) }
    },
    onSuccess: ({ row, sent: count }) => {
      setSent(count ? `${row.client_name}: eslatma yuborildi.` : `${row.client_name}: bugun allaqachon yuborilgan yoki kabinetda to‘lovni ko‘radigan odam yo‘q.`)
      queryClient.invalidateQueries({ queryKey: ['debts'] })
    },
  })
  const totals: Record<string, number> = {}
  debts.data?.forEach((d) => Object.entries(d.outstanding ?? {}).forEach(([cur, value]) => { totals[cur] = (totals[cur] ?? 0) + Number(value) }))
  return (
    <>
      <ErrorBox error={debts.error || remind.error} />
      {sent && <div className="mb-3 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[13.5px] font-semibold">{sent}</div>}
      {debts.isLoading ? <Spinner /> : debts.data?.length === 0 ? <Empty title="Qarzdor mijoz yo‘q" /> : (
        <>
          <p className="mb-3 text-muted">Jami qarz: <b className="num text-ink">{Object.entries(totals).map(([cur, value]) => money(value.toFixed(2), cur)).join(' · ')}</b></p>
          <Table head={['Mijoz', 'Qarz', 'Hisob-faktura', 'Kechikish', '']}>
            {debts.data?.map((d) => (
              <tr key={d.client_id}>
                <td className="font-semibold">{d.client_name}</td>
                <td className="num font-bold">{Object.entries(d.outstanding ?? {}).map(([cur, value]) => money(value, cur)).join(' · ')}</td>
                <td className="num">{d.invoices} ta</td>
                <td>{d.days_overdue > 0 ? <Badge tone="bad">{d.days_overdue} kun</Badge> : <Badge tone="warn">Muddati kelmagan</Badge>}</td>
                <td className="text-right"><Button variant="ghost" disabled={remind.isPending} onClick={() => remind.mutate(d)}><Bell size={15} />Eslatish</Button></td>
              </tr>
            ))}
          </Table>
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
  const fetchCbu = useMutation({
    mutationFn: () => post<{ date: string; rate_to_uzs: string }>('/finance/rates/fetch/', { date: form.date }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rates'] }),
  })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Kicker>Dollar kursi (Markaziy bank)</Kicker>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button variant="dark" onClick={() => fetchCbu.mutate()} disabled={fetchCbu.isPending}><RefreshCw size={15} />cbu.uz’dan olish</Button>
          {fetchCbu.data && <span className="text-[13px]">{date(fetchCbu.data.date)}: <b className="num">{rate(fetchCbu.data.rate_to_uzs)}</b></span>}
        </div>
        <ErrorBox error={fetchCbu.error} />
        <p className="mb-3 text-[12.5px] text-muted">Yoki qo‘lda kiriting (masalan, bank kursi bo‘yicha kelishilgan bo‘lsa):</p>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="flex flex-wrap items-end gap-2">
          <Field label="Sana"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="1$ = so‘m"><Input type="number" step="0.01" value={form.rate_to_uzs} onChange={(e) => setForm({ ...form, rate_to_uzs: e.target.value })} required /></Field>
          <Button type="submit">Saqlash</Button>
        </form>
        <ErrorBox error={save.error} />
        <p className="mt-2 text-[12px] text-muted">To‘lov kiritilganda o‘sha kunning kursi bazada bo‘lmasa, cbu.uz’dan o‘zi olinadi. Har kuni ertalab ham olinadi.</p>
      </Card>
      <Table head={['Sana', 'Kurs']}>
        {list.data?.results.map((r) => <tr key={r.id}><td className="num">{date(r.date)}</td><td className="num">{rate(r.rate_to_uzs)}</td></tr>)}
      </Table>
    </div>
  )
}

export function MyExpenses() {
  const [adding, setAdding] = useState(false)
  const list = useQuery({ queryKey: ['expenses', 'mine'], queryFn: () => get<Page<Expense>>('/finance/expenses/', { page_size: 50 }) })
  return (
    <Card className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Kicker>Mening xarajat so‘rovlarim</Kicker>
        <Button variant="ghost" onClick={() => setAdding(true)}><FileText size={15} />So‘rov yuborish</Button>
      </div>
      {list.data?.results.length === 0 && <div className="py-2 text-[13px] text-muted">Hali so‘rov yo‘q. Ish uchun pul sarflagan bo‘lsangiz, shu yerdan yuboring.</div>}
      <div className="divide-y divide-line-soft">
        {list.data?.results.map((e) => (
          <div key={e.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${e.cancelled_at ? 'opacity-50' : ''}`}>
            <span className="num text-[12.5px] text-muted">{date(e.spent_on)}</span>
            <span className="min-w-0 flex-1 font-semibold">{e.description}</span>
            <span className="num">{money(e.amount, e.currency)}</span>
            <StatusBadge status={e.status} label={e.status_label} />
          </div>
        ))}
      </div>
      {adding && <ExpenseForm onClose={() => setAdding(false)} />}
    </Card>
  )
}
