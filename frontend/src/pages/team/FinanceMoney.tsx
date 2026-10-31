import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api, get, patch, post } from '../../shared/api/client'
import type { AccountStatement, AccountTransfer, CashAccount, ExpenseCategory, Page, Partner, PartnerWithdrawal, RecurringExpense } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, money, monthKey, today } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, Modal, Select, Spinner } from '../../shared/ui'
import { useActiveProjects } from './Content'
import { AccountField, useCashAccounts } from './financeShared'
import { MonthPicker } from './Payroll'

const KINDS: Record<CashAccount['kind'], string> = { cash: 'Naqd kassa', card: 'Karta', bank: 'Bank hisobi' }

export function Accounts() {
  const queryClient = useQueryClient()
  const list = useCashAccounts()
  const [openId, setOpenId] = useState<number | null>(null)
  const [moving, setMoving] = useState(false)
  const [form, setForm] = useState({ name: '', kind: 'cash', currency: 'UZS', opening_balance: '' })
  const transfers = useQuery({ queryKey: ['transfers'], queryFn: () => get<Page<AccountTransfer>>('/finance/transfers/', { page_size: 30 }) })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
    queryClient.invalidateQueries({ queryKey: ['transfers'] })
  }
  const create = useMutation({
    mutationFn: () => post('/finance/accounts/', { ...form, opening_balance: form.opening_balance || 0 }),
    onSuccess: () => { refresh(); setForm({ ...form, name: '', opening_balance: '' }) },
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CashAccount> }) => patch(`/finance/accounts/${id}/`, body),
    onSuccess: refresh,
  })
  const cancelMove = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/finance/transfers/${id}/cancel/`, { reason }),
    onSuccess: refresh,
  })
  const totals: Record<string, number> = {}
  list.data?.filter((a) => a.is_active).forEach((a) => { totals[a.currency] = (totals[a.currency] ?? 0) + Number(a.balance) })
  const open = list.data?.find((a) => a.id === openId)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-muted">Jami qoldiq: <b className="num text-ink">{Object.entries(totals).map(([cur, value]) => money(value.toFixed(2), cur)).join(' · ') || '—'}</b></span>
        <Button variant="ghost" onClick={() => setMoving(true)}><ArrowLeftRight size={15} />Hisoblar orasida o‘tkazish</Button>
      </div>
      <ErrorBox error={list.error || update.error || cancelMove.error} />
      {list.isLoading ? <Spinner /> : (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data?.map((a) => (
            <Card key={a.id} className={a.is_active ? '' : 'opacity-55'}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-bold">{a.name}</div><div className="text-[12px] text-muted">{KINDS[a.kind]} · {a.currency}</div></div>
                {!a.is_active && <Badge>O‘chirilgan</Badge>}
              </div>
              <div className="num mt-3 font-display text-[22px] font-semibold">{money(a.balance, a.currency)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setOpenId(a.id)}>Ko‘chirma</Button>
                <Button variant="ghost" disabled={update.isPending} onClick={() => { const value = prompt('Boshlang‘ich qoldiq', a.opening_balance); if (value !== null && value !== '') update.mutate({ id: a.id, body: { opening_balance: value } }) }}>Boshlang‘ich</Button>
                <Button variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ id: a.id, body: { is_active: !a.is_active } })}>{a.is_active ? 'O‘chirish' : 'Yoqish'}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <Kicker>Yangi hisob</Kicker>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
            <Field label="Nomi"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Masalan: Ofis kassasi" required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Turi"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
              <Field label="Valyuta"><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>UZS</option><option>USD</option></Select></Field>
            </div>
            <Field label="Hozirgi qoldiq" hint="Hisobda hozir qancha pul bo‘lsa, shuni yozing."><Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></Field>
            <ErrorBox error={create.error} />
            <Button disabled={create.isPending}><Plus size={15} />Qo‘shish</Button>
          </form>
        </Card>
        <Card>
          <Kicker>So‘nggi o‘tkazmalar</Kicker>
          {transfers.data?.results.length === 0 && <div className="py-2 text-[13px] text-muted">Hali o‘tkazma yo‘q.</div>}
          <div className="divide-y divide-line-soft">
            {transfers.data?.results.map((t) => (
              <div key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${t.cancelled_at ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.from_name} → {t.to_name}</div>
                  <div className="num text-[12px] text-muted">{date(t.moved_on)}{t.note && ` · ${t.note}`}</div>
                </div>
                <span className="num font-bold">{money(t.amount, t.from_currency)}{t.from_currency !== t.to_currency && ` → ${money(t.to_amount, t.to_currency)}`}</span>
                {t.cancelled_at ? <Badge>Bekor</Badge> : <Button variant="ghost" onClick={() => { const reason = prompt('Bekor qilish sababi'); if (reason) cancelMove.mutate({ id: t.id, reason }) }}>Bekor</Button>}
              </div>
            ))}
          </div>
        </Card>
      </div>
      {moving && <TransferForm accounts={list.data ?? []} onClose={() => setMoving(false)} onDone={refresh} />}
      {open && <StatementModal account={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

function TransferForm({ accounts, onClose, onDone }: { accounts: CashAccount[]; onClose: () => void; onDone: () => void }) {
  const active = accounts.filter((a) => a.is_active)
  const [form, setForm] = useState({ from_account: '', to_account: '', amount: '', to_amount: '', moved_on: today(), note: '' })
  const from = active.find((a) => String(a.id) === form.from_account)
  const to = active.find((a) => String(a.id) === form.to_account)
  const exchange = !!from && !!to && from.currency !== to.currency
  const save = useMutation({
    mutationFn: () => post('/finance/transfers/', { ...form, from_account: Number(form.from_account), to_account: Number(form.to_account), to_amount: exchange ? form.to_amount : null }),
    onSuccess: () => { onDone(); onClose() },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  const options = active.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)
  return (
    <Modal title="Hisoblar orasida o‘tkazish" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qayerdan"><Select value={form.from_account} onChange={set('from_account')} required><option value="">Tanlang…</option>{options}</Select></Field>
          <Field label="Qayerga"><Select value={form.to_account} onChange={set('to_account')} required><option value="">Tanlang…</option>{options}</Select></Field>
        </div>
        <Field label={`Summa${from ? ` (${from.currency})` : ''}`}><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required /></Field>
        {exchange && <Field label={`Tushgan summa (${to?.currency})`} hint="Valyuta almashtirilsa, necha pul tushganini yozing."><Input type="number" min="0.01" step="0.01" value={form.to_amount} onChange={set('to_amount')} required /></Field>}
        <Field label="Sana"><Input type="date" value={form.moved_on} onChange={set('moved_on')} required /></Field>
        <Field label="Izoh"><Input value={form.note} onChange={set('note')} /></Field>
        <ErrorBox error={save.error} />
        <Button className="w-full" disabled={save.isPending}>O‘tkazish</Button>
      </form>
    </Modal>
  )
}

function StatementModal({ account, onClose }: { account: CashAccount; onClose: () => void }) {
  const [month, setMonth] = useState(monthKey())
  const data = useQuery({ queryKey: ['statement', account.id, month], queryFn: () => get<AccountStatement>(`/finance/accounts/${account.id}/statement/`, { month }) })
  const s = data.data
  return (
    <Modal title={`${account.name}: ko‘chirma`} onClose={onClose} wide>
      <div className="mb-3"><MonthPicker month={month} onChange={setMonth} /></div>
      <ErrorBox error={data.error} />
      {!s ? <Spinner /> : (
        <>
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-[13.5px]"><span>Oy boshida: <b className="num">{money(s.opening, account.currency)}</b></span><span>Oy oxirida: <b className="num">{money(s.closing, account.currency)}</b></span></div>
          {s.items.length === 0 ? <div className="py-6 text-center text-muted">Bu oy harakat yo‘q.</div> : (
            <div className="divide-y divide-line-soft">
              {s.items.map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <span className="num w-[78px] shrink-0 text-[12px] text-muted">{date(row.date)}</span>
                  <span className="min-w-0 flex-1 text-[13.5px]">{row.label}</span>
                  <span className={`num shrink-0 text-right font-bold ${Number(row.amount) < 0 ? '' : 'text-ok'}`}>{Number(row.amount) > 0 && '+'}{money(row.amount, account.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

export function Partners() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['partners'], queryFn: () => get<Partner[]>('/finance/partners/') })
  const withdrawals = useQuery({ queryKey: ['withdrawals'], queryFn: () => get<Page<PartnerWithdrawal>>('/finance/withdrawals/', { page_size: 50 }) })
  const accounts = useCashAccounts()
  const [form, setForm] = useState({ name: '', share_percent: '' })
  const [take, setTake] = useState({ partner: '', amount: '', currency: 'UZS', taken_on: today(), account: '', note: '' })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['partners'] })
    queryClient.invalidateQueries({ queryKey: ['withdrawals'] })
    queryClient.invalidateQueries({ queryKey: ['report'] })
    queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
  }
  const create = useMutation({ mutationFn: () => post('/finance/partners/', form), onSuccess: () => { refresh(); setForm({ name: '', share_percent: '' }) } })
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<Partner> }) => patch(`/finance/partners/${id}/`, body), onSuccess: refresh })
  const record = useMutation({
    mutationFn: () => post('/finance/withdrawals/', { ...take, partner: Number(take.partner), account: take.account ? Number(take.account) : null }),
    onSuccess: () => { refresh(); setTake({ ...take, amount: '', note: '' }) },
  })
  const cancel = useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => post(`/finance/withdrawals/${id}/cancel/`, { reason }), onSuccess: refresh })
  const active = list.data?.filter((p) => p.is_active) ?? []
  const sum = active.reduce((total, p) => total + Number(p.share_percent), 0)
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <Kicker>Sheriklar va ulush</Kicker>
        <p className="mb-3 text-[13px] text-muted">Sof foyda shu foizlar bo‘yicha bo‘linadi. Jami: <b className="num text-ink">{sum}%</b>{sum !== 100 && active.length > 0 && <span className="text-warn"> (100% bo‘lishi kerak)</span>}</p>
        <ErrorBox error={list.error || update.error} />
        <div className="divide-y divide-line-soft">
          {list.data?.map((p) => (
            <div key={p.id} className={`flex items-center gap-3 py-2.5 ${p.is_active ? '' : 'opacity-50'}`}>
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              <span className="num font-bold">{Number(p.share_percent)}%</span>
              <Button variant="ghost" onClick={() => { const value = prompt('Yangi ulush, %', p.share_percent); if (value) update.mutate({ id: p.id, body: { share_percent: value } }) }}>Ulush</Button>
              <Button variant="ghost" onClick={() => update.mutate({ id: p.id, body: { is_active: !p.is_active } })}>{p.is_active ? 'O‘chirish' : 'Yoqish'}</Button>
            </div>
          ))}
        </div>
        <form className="mt-3 grid grid-cols-[1fr_90px_auto] items-end gap-2 border-t border-line-soft pt-3" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <Field label="Ism"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Ulush, %"><Input type="number" min="0" max="100" step="0.01" value={form.share_percent} onChange={(e) => setForm({ ...form, share_percent: e.target.value })} required /></Field>
          <Button disabled={create.isPending} aria-label="Sherik qo‘shish"><Plus size={15} /></Button>
        </form>
        <ErrorBox error={create.error} />
      </Card>
      <Card>
        <Kicker>Sherik olgan pul</Kicker>
        <p className="mb-3 text-[13px] text-muted">Bu xarajat emas: foydani kamaytirmaydi, faqat hisobdan chiqadi.</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); record.mutate() }}>
          <Field label="Sherik"><Select value={take.partner} onChange={(e) => setTake({ ...take, partner: e.target.value })} required><option value="">Tanlang…</option>{active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Field label="Summa"><Input type="number" min="0.01" step="0.01" value={take.amount} onChange={(e) => setTake({ ...take, amount: e.target.value })} required /></Field></div>
            <Field label="Valyuta"><Select value={take.currency} onChange={(e) => setTake({ ...take, currency: e.target.value, account: '' })}><option>UZS</option><option>USD</option></Select></Field>
          </div>
          <Field label="Sana"><Input type="date" value={take.taken_on} onChange={(e) => setTake({ ...take, taken_on: e.target.value })} required /></Field>
          <AccountField accounts={accounts.data} currency={take.currency} value={take.account} onChange={(e) => setTake({ ...take, account: e.target.value })} label="Qaysi hisobdan" />
          <ErrorBox error={record.error || cancel.error} />
          <Button disabled={record.isPending}>Yozib qo‘yish</Button>
        </form>
        <div className="mt-3 divide-y divide-line-soft border-t border-line-soft">
          {withdrawals.data?.results.map((w) => (
            <div key={w.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${w.cancelled_at ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1"><div className="font-semibold">{w.partner_name}</div><div className="num text-[12px] text-muted">{date(w.taken_on)}{w.account_name && ` · ${w.account_name}`}</div></div>
              <span className="num font-bold">{money(w.amount, w.currency)}</span>
              {w.cancelled_at ? <Badge>Bekor</Badge> : <Button variant="ghost" onClick={() => { const reason = prompt('Bekor qilish sababi'); if (reason) cancel.mutate({ id: w.id, reason }) }}>Bekor</Button>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function SettingsTab() {
  const { can } = useAuth()
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {can('finance.manage') && <Recurring />}
      <Categories />
    </div>
  )
}

function Recurring() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['recurring'], queryFn: () => get<RecurringExpense[]>('/finance/recurring/') })
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => get<ExpenseCategory[]>('/finance/expense-categories/') })
  const accounts = useCashAccounts()
  const projects = useActiveProjects()
  const [form, setForm] = useState({ category: '', description: '', amount: '', currency: 'UZS', day_of_month: '1', account: '', project: '' })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['recurring'] })
  const create = useMutation({
    mutationFn: () => post('/finance/recurring/', { ...form, category: Number(form.category || categories.data?.[0]?.id), day_of_month: Number(form.day_of_month), account: form.account ? Number(form.account) : null, project: form.project ? Number(form.project) : null }),
    onSuccess: () => { refresh(); setForm({ ...form, description: '', amount: '' }) },
  })
  const toggle = useMutation({ mutationFn: (r: RecurringExpense) => patch(`/finance/recurring/${r.id}/`, { is_active: !r.is_active }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: number) => api(`/finance/recurring/${id}/`, { method: 'DELETE' }), onSuccess: refresh })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Card>
      <Kicker>Takroriy xarajatlar</Kicker>
      <p className="mb-3 text-[13px] text-muted">Ijara, servis, internet: belgilangan kuni xarajatga o‘zi yoziladi va rahbarga xabar boradi.</p>
      <ErrorBox error={list.error || toggle.error || remove.error} />
      {list.data?.length === 0 && <Empty title="Takroriy xarajat yo‘q" />}
      <div className="divide-y divide-line-soft">
        {list.data?.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${r.is_active ? '' : 'opacity-50'}`}>
            <div className="min-w-0 flex-1"><div className="font-semibold">{r.description}</div><div className="text-[12px] text-muted">Har oy {r.day_of_month}-sana · {r.category_name}{r.account_name && ` · ${r.account_name}`}</div></div>
            <span className="num font-bold">{money(r.amount, r.currency)}</span>
            <Button variant="ghost" onClick={() => toggle.mutate(r)}>{r.is_active ? 'To‘xtatish' : 'Yoqish'}</Button>
            <Button variant="ghost" aria-label="O‘chirish" onClick={() => confirm('O‘chirilsinmi? Yozilgan xarajatlar qoladi.') && remove.mutate(r.id)}><Trash2 size={15} /></Button>
          </div>
        ))}
      </div>
      <form className="mt-3 space-y-3 border-t border-line-soft pt-3" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
        <Field label="Nima uchun"><Input value={form.description} onChange={set('description')} placeholder="Masalan: Ofis ijarasi" required /></Field>
        <Field label="Kategoriya"><Select value={form.category} onChange={set('category')}>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Summa"><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required /></Field>
          <Field label="Valyuta"><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, account: '' })}><option>UZS</option><option>USD</option></Select></Field>
          <Field label="Kuni"><Input type="number" min="1" max="28" value={form.day_of_month} onChange={set('day_of_month')} required /></Field>
        </div>
        <AccountField accounts={accounts.data} currency={form.currency} value={form.account} onChange={set('account')} label="Qaysi hisobdan" />
        <Field label="Mijoz"><Select value={form.project} onChange={set('project')}><option value="">Umumiy xarajat</option>{projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}</Select></Field>
        <ErrorBox error={create.error} />
        <Button disabled={create.isPending}><Plus size={15} />Qo‘shish</Button>
      </form>
    </Card>
  )
}

function Categories() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['expense-categories'], queryFn: () => get<ExpenseCategory[]>('/finance/expense-categories/') })
  const [name, setName] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
  const create = useMutation({
    mutationFn: () => post('/finance/expense-categories/', { name, sort: (list.data?.length ?? 0) + 1 }),
    onSuccess: () => { refresh(); setName('') },
  })
  const rename = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) => patch(`/finance/expense-categories/${id}/`, { name: value }),
    onSuccess: refresh,
  })
  return (
    <Card>
      <Kicker>Xarajat kategoriyalari</Kicker>
      <p className="mb-3 text-[13px] text-muted">Hisobotda xarajatlar shu bo‘limlar bo‘yicha ko‘rinadi.</p>
      <ErrorBox error={list.error || create.error || rename.error} />
      <div className="divide-y divide-line-soft">
        {list.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
            <Button variant="ghost" disabled={rename.isPending} onClick={() => { const value = prompt('Yangi nom', c.name)?.trim(); if (value && value !== c.name) rename.mutate({ id: c.id, value }) }}>Nomini o‘zgartirish</Button>
          </div>
        ))}
      </div>
      <form className="mt-3 flex items-end gap-2 border-t border-line-soft pt-3" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
        <div className="min-w-0 flex-1"><Field label="Yangi kategoriya"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Studiya ijarasi" required /></Field></div>
        <Button disabled={create.isPending}><Plus size={15} />Qo‘shish</Button>
      </form>
    </Card>
  )
}
