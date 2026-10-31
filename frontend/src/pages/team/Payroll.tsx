import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api, downloadFile, get, post } from '../../shared/api/client'
import type { CompensationRule, Page, PayrollSheet, Position, SheetRow, StaffUser, Tariff } from '../../shared/api/types'
import { date, money, monthKey, monthLabel, pct, shiftMonth, today } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, Table, Tabs } from '../../shared/ui'
import { useAuth } from '../../shared/auth/AuthProvider'
import { useActiveProjects } from './Content'
import { AccountField, useCashAccounts } from './financeShared'

interface AccrualRow { id: number; user_name: string; client_name: string; position_name: string; base_amount: string; percent: string; amount: string; currency: string; amount_uzs: string; accrued_on: string; status_label: string }

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-line bg-white">
      <button className="p-2" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Oldingi oy"><ChevronLeft size={16} /></button>
      <span className="min-w-[120px] text-center font-semibold">{monthLabel(month)}</span>
      <button className="p-2" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Keyingi oy"><ChevronRight size={16} /></button>
    </div>
  )
}

export function PayrollPage() {
  const [tab, setTab] = useState<'sheet' | 'payouts' | 'accruals' | 'rules' | 'adjustments'>('sheet')
  const [month, setMonth] = useState(monthKey())
  return (
    <>
      <PageHeader title="Maosh" subtitle="Fiks oylik yo‘q: har loyiha to‘lovidan foiz. Mijoz to‘lagan kuni hisoblanadi." actions={<MonthPicker month={month} onChange={setMonth} />} />
      <Tabs value={tab} onChange={setTab} items={[['sheet', 'Vedomost'], ['payouts', 'To‘lovlar tarixi'], ['accruals', 'Hisoblanmalar'], ['rules', 'Foiz qoidalari'], ['adjustments', 'Avans va bonus']]} />
      {tab === 'sheet' && <Sheet month={month} />}
      {tab === 'payouts' && <Payouts month={month} />}
      {tab === 'accruals' && <Accruals month={month} />}
      {tab === 'rules' && <Rules />}
      {tab === 'adjustments' && <Adjustments month={month} />}
    </>
  )
}

function Sheet({ month }: { month: string }) {
  const queryClient = useQueryClient()
  const { can } = useAuth()
  const [paying, setPaying] = useState<SheetRow | null>(null)
  const sheet = useQuery({ queryKey: ['sheet', month], queryFn: () => get<PayrollSheet>('/payroll/sheet/', { month }) })
  const approve = useMutation({ mutationFn: () => post('/payroll/sheet/', { month, action: 'approve' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sheet', month] }) })
  if (sheet.isLoading) return <Spinner />
  const s = sheet.data
  if (!s) return <ErrorBox error={sheet.error} />
  const total = s.rows.reduce((sum, r) => sum + Number(r.payable_uzs), 0)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Badge tone={s.status === 'draft' ? 'draft' : s.status === 'approved' ? 'warn' : 'ok'}>{s.status_label}</Badge>
        <span className="text-muted">Jami to‘lanadi: <b className="num text-ink">{money(Math.round(total))}</b></span>
        {s.status === 'draft' && s.rows.length > 0 && <Button onClick={() => confirm('Vedomost tasdiqlansinmi? Keyin bu oyga tuzatish kiritilmaydi.') && approve.mutate()}>Tasdiqlash</Button>}
        {can('reports.agency') && s.rows.length > 0 && <Button variant="ghost" onClick={() => downloadFile('/finance/export/payroll/', `vedomost-${month}.csv`, { month })}><Download size={15} />CSV</Button>}
      </div>
      <ErrorBox error={approve.error} />
      {s.rows.length === 0 ? <Empty title="Bu oy hisoblanma yo‘q" hint="Mijoz to‘lovi qayd etilganda bu yerda paydo bo‘ladi." /> : (
        <Table head={['Xodim', 'Hisoblandi', 'Tuzatishlar', 'To‘lanadi', 'To‘landi', 'Qoldiq', '']}>
          {s.rows.map((r) => (
            <tr key={r.user_id}>
              <td className="font-semibold">{r.full_name}<div className="text-[12px] font-normal text-muted">{r.items} ta to‘lovdan</div></td>
              <td className="num">{money(r.accrued_uzs)}</td>
              <td className="num">{money(r.adjustments_uzs)}</td>
              <td className="num font-bold">{money(r.payable_uzs)}</td>
              <td className="num">{money(r.paid_uzs)}</td>
              <td className="num">{money(r.remaining_uzs)}</td>
              <td className="text-right">{s.status !== 'draft' && Number(r.remaining_uzs) > 0 && <Button onClick={() => setPaying(r)}>To‘lash</Button>}</td>
            </tr>
          ))}
        </Table>
      )}
      {paying && <PayoutForm month={month} row={paying} onClose={() => setPaying(null)} />}
    </>
  )
}

function PayoutForm({ month, row, onClose }: { month: string; row: SheetRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const accounts = useCashAccounts()
  const [form, setForm] = useState({ amount: String(Math.round(Number(row.remaining_uzs))), method: 'card', paid_on: today(), account: '', note: '' })
  const save = useMutation({
    mutationFn: () => post('/payroll/sheet/', { month, action: 'payout', user: row.user_id, amount_uzs: form.amount, paid_on: form.paid_on, method: form.method, note: form.note, account: form.account ? Number(form.account) : null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet', month] })
      queryClient.invalidateQueries({ queryKey: ['payouts', month] })
      queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
      onClose()
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title={`To‘lov · ${row.full_name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <p className="text-[13px] text-muted">Qoldiq: <b className="num text-ink">{money(row.remaining_uzs)}</b></p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Summa (so‘m)"><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required /></Field>
          <Field label="Sana"><Input type="date" value={form.paid_on} onChange={set('paid_on')} required /></Field>
        </div>
        <Field label="Usul"><Select value={form.method} onChange={set('method')}><option value="card">Karta</option><option value="cash">Naqd</option></Select></Field>
        <AccountField accounts={accounts.data} currency="UZS" value={form.account} onChange={set('account')} label="Qaysi hisobdan" />
        <Field label="Izoh"><Input value={form.note} onChange={set('note')} /></Field>
        <ErrorBox error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Qayd etish</Button>
      </form>
    </Modal>
  )
}

interface PayoutRow { id: number; user_name: string; amount_uzs: string; paid_on: string; method_label: string; account_name: string; note: string; cancelled_at: string | null; cancel_reason: string }

function Payouts({ month }: { month: string }) {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['payouts', month], queryFn: () => get<Page<PayoutRow>>('/payroll/payouts/', { month, page_size: 300 }) })
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/payroll/payouts/${id}/cancel/`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payouts', month] })
      queryClient.invalidateQueries({ queryKey: ['sheet', month] })
      queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
    },
  })
  if (list.isLoading) return <Spinner />
  return (
    <>
      <ErrorBox error={list.error || cancel.error} />
      {list.data?.results.length === 0 ? <Empty title="Bu oy maosh to‘lanmagan" /> : (
        <Table head={['Sana', 'Xodim', 'Summa', 'Usul', 'Izoh', '']}>
          {list.data?.results.map((p) => (
            <tr key={p.id} className={p.cancelled_at ? 'opacity-50' : ''}>
              <td className="num">{date(p.paid_on)}</td>
              <td className="font-semibold">{p.user_name}</td>
              <td className="num font-bold">{money(p.amount_uzs)}</td>
              <td>{p.method_label}{p.account_name && <div className="text-[12px] text-muted">{p.account_name}</div>}</td>
              <td className="text-[13px] text-muted">{p.note}</td>
              <td className="text-right">{p.cancelled_at ? <Badge>Bekor: {p.cancel_reason}</Badge> : <Button variant="ghost" onClick={() => { const reason = prompt('Bekor qilish sababi'); if (reason) cancel.mutate({ id: p.id, reason }) }}>Bekor</Button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

function Accruals({ month }: { month: string }) {
  const list = useQuery({ queryKey: ['accruals', month], queryFn: () => get<Page<AccrualRow>>('/payroll/accruals/', { month, page_size: 500 }) })
  if (list.data?.results.length === 0) return <Empty title="Hisoblanma yo‘q" />
  return (
    <Table head={['Sana', 'Xodim', 'Mijoz', 'Lavozim', 'Asos', '%', 'Ulush', 'So‘mda', 'Holat']}>
      {list.data?.results.map((a) => (
        <tr key={a.id}>
          <td className="num">{date(a.accrued_on)}</td><td className="font-semibold">{a.user_name}</td><td>{a.client_name}</td><td>{a.position_name}</td>
          <td className="num">{money(a.base_amount, a.currency)}</td><td className="num">{pct(a.percent)}</td><td className="num">{money(a.amount, a.currency)}</td>
          <td className="num">{money(a.amount_uzs)}</td><td>{a.status_label}</td>
        </tr>
      ))}
    </Table>
  )
}

const SCOPE_LABEL = { global: 'Hamma loyihalar', tariff: 'Tarif', project: 'Loyiha' }

function Rules() {
  const [adding, setAdding] = useState(false)
  const rules = useQuery({ queryKey: ['rules'], queryFn: () => get<CompensationRule[]>('/payroll/rules/') })
  return (
    <>
      <div className="mb-4 rounded-2xl border border-gold/40 bg-gold-soft px-5 py-4 text-[13px] text-gold-ink">
        Qoida o‘chirilmaydi. Foizni o‘zgartirish uchun yangi sana bilan yangi qoida qo‘shing — o‘tgan oylar eski foizda qoladi. Ustuvorlik: loyiha → tarif → hamma loyihalar.
      </div>
      <Button className="mb-3" onClick={() => setAdding(true)}><Plus size={15} />Yangi qoida</Button>
      <Table head={['Lavozim', 'Foiz', 'Qayerga', 'Amal qiladi', 'Izoh']}>
        {rules.data?.map((r) => (
          <tr key={r.id}>
            <td className="font-semibold">{r.position_name}</td>
            <td className="num font-bold">{pct(r.percent)}</td>
            <td>{SCOPE_LABEL[r.scope]}{r.tariff_name && `: ${r.tariff_name}`}{r.project_title && `: ${r.project_title}`}</td>
            <td className="num">{date(r.valid_from)} dan</td>
            <td className="text-[12px] text-muted">{r.note}</td>
          </tr>
        ))}
      </Table>
      {adding && <RuleForm onClose={() => setAdding(false)} />}
    </>
  )
}

function RuleForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const positions = useQuery({ queryKey: ['positions'], queryFn: () => get<Position[]>('/positions/') })
  const tariffs = useQuery({ queryKey: ['tariffs'], queryFn: () => get<Tariff[]>('/catalog/tariffs/') })
  const projects = useActiveProjects()
  const [form, setForm] = useState({ position: '', percent: '', valid_from: today(), scope: 'global', tariff: '', project: '', note: '' })
  const save = useMutation({
    mutationFn: () => post('/payroll/rules/', {
      position: Number(form.position), percent: form.percent, valid_from: form.valid_from, note: form.note,
      tariff: form.scope === 'tariff' ? Number(form.tariff) : null, project: form.scope === 'project' ? Number(form.project) : null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rules'] }); onClose() },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title="Foiz qoidasi" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lavozim"><Select value={form.position} onChange={set('position')} required><option value="">Tanlang…</option>{positions.data?.filter((p) => p.is_team_share).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Foiz"><Input type="number" min="0" max="100" step="0.01" value={form.percent} onChange={set('percent')} required /></Field>
        </div>
        <Field label="Qayerga">
          <Select value={form.scope} onChange={set('scope')}><option value="global">Hamma loyihalar</option><option value="tariff">Bitta tarif</option><option value="project">Bitta loyiha</option></Select>
        </Field>
        {form.scope === 'tariff' && <Field label="Tarif"><Select value={form.tariff} onChange={set('tariff')} required><option value="">Tanlang…</option>{tariffs.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
        {form.scope === 'project' && <Field label="Loyiha"><Select value={form.project} onChange={set('project')} required><option value="">Tanlang…</option>{projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name} · {p.tariff_name}</option>)}</Select></Field>}
        <Field label="Amal qilish sanasi"><Input type="date" value={form.valid_from} onChange={set('valid_from')} required /></Field>
        <Field label="Izoh"><Input value={form.note} onChange={set('note')} /></Field>
        <ErrorBox error={save.error} />
        <Button type="submit" className="w-full">Saqlash</Button>
      </form>
    </Modal>
  )
}

function Adjustments({ month }: { month: string }) {
  const queryClient = useQueryClient()
  const [year, mon] = month.split('-').map(Number)
  const list = useQuery({ queryKey: ['adjustments', month], queryFn: () => get<Page<{ id: number; user_name: string; kind_label: string; amount_uzs: string; reason: string }>>('/payroll/adjustments/', { year, month: mon }) })
  const accounts = useCashAccounts()
  const remove = useMutation({
    mutationFn: (id: number) => api(`/payroll/adjustments/${id}/`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adjustments', month] }); queryClient.invalidateQueries({ queryKey: ['sheet', month] }) },
  })
  const users = useQuery({ queryKey: ['users', 'staff'], queryFn: () => get<Page<StaffUser>>('/users/', { staff: 1, page_size: 200 }) })
  const [form, setForm] = useState({ user: '', kind: 'advance', amount_uzs: '', reason: '', account: '' })
  const save = useMutation({
    mutationFn: () => post('/payroll/adjustments/', { ...form, user: Number(form.user), year, month: mon, account: form.account ? Number(form.account) : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adjustments', month] }); queryClient.invalidateQueries({ queryKey: ['sheet', month] }); setForm({ ...form, amount_uzs: '', reason: '' }) },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Kicker>Yangi tuzatish · {monthLabel(month)}</Kicker>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
          <Field label="Xodim"><Select value={form.user} onChange={set('user')} required><option value="">Tanlang…</option>{users.data?.results.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Turi"><Select value={form.kind} onChange={set('kind')}><option value="advance">Avans</option><option value="bonus">Bonus</option><option value="penalty">Jarima</option><option value="piecework">Dona ish (brendfeys, frilanser)</option><option value="other">Boshqa</option></Select></Field>
            <Field label="Summa (so‘m)"><Input type="number" min="0" value={form.amount_uzs} onChange={set('amount_uzs')} required /></Field>
          </div>
          {form.kind === 'advance' && <AccountField accounts={accounts.data} currency="UZS" value={form.account} onChange={set('account')} label="Qaysi hisobdan berildi" />}
          <Field label="Sababi"><Input value={form.reason} onChange={set('reason')} required /></Field>
          <ErrorBox error={save.error || remove.error} />
          <Button type="submit">Qo‘shish</Button>
        </form>
      </Card>
      <Table head={['Xodim', 'Turi', 'Summa', 'Sabab', '']}>
        {list.data?.results.map((a) => <tr key={a.id}><td>{a.user_name}</td><td>{a.kind_label}</td><td className="num">{money(a.amount_uzs)}</td><td>{a.reason}</td><td className="text-right"><Button variant="ghost" aria-label="O‘chirish" disabled={remove.isPending} onClick={() => confirm('Tuzatish o‘chirilsinmi?') && remove.mutate(a.id)}><Trash2 size={15} /></Button></td></tr>)}
      </Table>
    </div>
  )
}
