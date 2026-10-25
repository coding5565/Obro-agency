import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { get, post } from '../../shared/api/client'
import type { Client, Page } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { money } from '../../shared/lib/format'
import { Button, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table } from '../../shared/ui'

export const NICHES: [string, string][] = [['clinic', 'Klinika'], ['education', 'O‘quv markazi'], ['restaurant', 'Restoran / kafe'],
  ['retail', 'Savdo'], ['beauty', 'Go‘zallik'], ['other', 'Boshqa']]
export const CLIENT_STATUSES: [string, string][] = [['lead', 'Potensial'], ['active', 'Faol'], ['paused', 'To‘xtatilgan'], ['churned', 'Ketgan']]

export function ClientsPage() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const list = useQuery({
    queryKey: ['clients', search, status],
    queryFn: () => get<Page<Client>>('/clients/', { search, status }),
  })
  return (
    <>
      <PageHeader title="Mijozlar" subtitle={list.data ? `${list.data.count} ta` : undefined}
        actions={can('clients.manage') && <Button onClick={() => setCreating(true)}><Plus size={16} />Yangi mijoz</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
          <option value="">Barcha holatlar</option>
          {CLIENT_STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      {list.isLoading ? <Spinner /> : list.data?.results.length === 0 ? <Empty title="Mijoz topilmadi" /> : (
        <Table head={['Mijoz', 'Soha', 'Holat', 'Tarif', 'Instagram']}>
          {list.data?.results.map((c) => (
            <tr key={c.id}>
              <td><Link to={`/app/clients/${c.id}`} className="font-semibold hover:text-bronze">{c.name}</Link><div className="text-[12px] text-muted">{c.city}</div></td>
              <td>{c.niche_label}</td>
              <td><StatusBadge status={c.status} label={c.status_label} /></td>
              <td>{c.active_project ? <>{c.active_project.tariff} <span className="num text-muted">{money(c.active_project.price, c.active_project.currency)}</span></> : '—'}</td>
              <td className="num text-[12px]">{c.social_accounts.map((s) => `@${s.username}`).join(', ') || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <ClientForm onClose={() => setCreating(false)} />}
    </>
  )
}

function ClientForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', niche: 'clinic', city: 'Farg‘ona', status: 'lead', source: '', notes: '' })
  const create = useMutation({
    mutationFn: () => post<Client>('/clients/', form),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      navigate(`/app/clients/${client.id}`)
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate() }
  return (
    <Modal title="Yangi mijoz" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nomi"><Input value={form.name} onChange={set('name')} required autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Soha"><Select value={form.niche} onChange={set('niche')}>{NICHES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Holat"><Select value={form.status} onChange={set('status')}>{CLIENT_STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="Shahar"><Input value={form.city} onChange={set('city')} /></Field>
        <Field label="Qayerdan keldi" hint="Masalan: Instagram audit, tavsiya"><Input value={form.source} onChange={set('source')} /></Field>
        <ErrorBox error={create.error} />
        <Button type="submit" disabled={create.isPending} className="w-full">Saqlash</Button>
      </form>
    </Modal>
  )
}
