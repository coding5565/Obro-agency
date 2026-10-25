import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router'
import { get, patch, post } from '../../shared/api/client'
import type { Client, Invite, Page, Position, Project, StaffUser, Tariff } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, money, pct, today } from '../../shared/lib/format'
import { Badge, Button, Card, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner, StatusBadge } from '../../shared/ui'
import { CLIENT_STATUSES } from './Clients'

export function ClientDetailPage() {
  const { id } = useParams()
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const client = useQuery({ queryKey: ['client', id], queryFn: () => get<Client>(`/clients/${id}/`) })
  const projects = useQuery({ queryKey: ['projects', { client: id }], queryFn: () => get<Page<Project>>('/projects/', { client: id }) })
  const [modal, setModal] = useState<null | 'project' | 'contact' | 'social' | 'invite' | { assign: Project }>(null)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['client', id] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }
  const setStatus = useMutation({
    mutationFn: (status: string) => patch(`/clients/${id}/`, { status }),
    onSuccess: refresh,
  })
  if (client.isLoading) return <Spinner />
  const c = client.data
  if (!c) return <ErrorBox error={client.error} />
  const manage = can('clients.manage')

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<span className="flex items-center gap-2">{c.niche_label} · {c.city} <StatusBadge status={c.status} label={c.status_label} /></span>}
        actions={manage && (
          <>
            <Select value={c.status} onChange={(e) => setStatus.mutate(e.target.value)} className="w-40">
              {CLIENT_STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            {can('users.manage') && <Button variant="ghost" onClick={() => setModal('invite')}><UserPlus size={16} />Kabinetga taklif</Button>}
          </>
        )}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Kicker>Loyihalar</Kicker>
            {manage && <Button variant="dark" onClick={() => setModal('project')}><Plus size={15} />Loyiha (tarif)</Button>}
          </div>
          {projects.data?.results.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-display text-[16px] font-semibold">{p.tariff_name}</div>
                  <div className="text-[12.5px] text-muted">{date(p.start_date)} dan · {p.monthly_amount ? money(p.monthly_amount, p.currency) + ' / oy' : ''}</div>
                </div>
                <StatusBadge status={p.status} label={p.status_label} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(p.limits).map(([kind, qty]) => <Badge key={kind} tone="draft">{kind} {qty}</Badge>)}
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <Kicker>Jamoa</Kicker>
                  {manage && <button className="text-[12.5px] font-semibold text-bronze" onClick={() => setModal({ assign: p })}>+ Biriktirish</button>}
                </div>
                {p.assignments.length === 0 && <div className="text-[13px] text-muted">Hali hech kim biriktirilmagan — maosh foizi hisoblanmaydi.</div>}
                {p.assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border-b border-line-soft py-1.5 last:border-0">
                    <span className="font-semibold">{a.user_name}</span>
                    <span className="text-[12.5px] text-muted">{a.position_detail.name}{a.share_percent ? ` · ${pct(a.share_percent)}` : ''}{a.ended_at ? ` · ${date(a.ended_at)} gacha` : ''}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {projects.data?.results.length === 0 && <Card><div className="text-muted">Loyiha yo‘q. Mijoz tarif tanlagach, «Loyiha (tarif)» tugmasi bilan qo‘shing.</div></Card>}
        </div>
        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center justify-between"><Kicker>Kontaktlar</Kicker>{manage && <button className="text-[12.5px] font-semibold text-bronze" onClick={() => setModal('contact')}>+ Qo‘shish</button>}</div>
            {c.contacts.length === 0 && <div className="text-[13px] text-muted">Kontakt yo‘q</div>}
            {c.contacts.map((ct) => (
              <div key={ct.id} className="py-1"><div className="font-semibold">{ct.full_name}</div><div className="num text-[12px] text-muted">{ct.position} {ct.phone}</div></div>
            ))}
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between"><Kicker>Akkauntlar</Kicker>{can('metrics.manage') && <button className="text-[12.5px] font-semibold text-bronze" onClick={() => setModal('social')}>+ Qo‘shish</button>}</div>
            {c.social_accounts.map((s) => <div key={s.id} className="num py-0.5 text-[13px]">{s.platform_label} @{s.username}</div>)}
          </Card>
          {c.notes && <Card><Kicker>Ichki izoh</Kicker><div className="text-[13px] whitespace-pre-line">{c.notes}</div></Card>}
        </div>
      </div>
      {modal === 'project' && <ProjectForm clientId={c.id} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === 'contact' && <ContactForm clientId={c.id} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === 'social' && <SocialForm clientId={c.id} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === 'invite' && <InviteClientForm client={c} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <AssignForm project={modal.assign} onClose={() => setModal(null)} onSaved={refresh} />}
    </>
  )
}

function ProjectForm({ clientId, onClose, onSaved }: { clientId: number; onClose: () => void; onSaved: () => void }) {
  const tariffs = useQuery({ queryKey: ['tariffs'], queryFn: () => get<Tariff[]>('/catalog/tariffs/') })
  const [versionId, setVersionId] = useState('')
  const [start, setStart] = useState(today())
  const [discount, setDiscount] = useState('0')
  const [contract, setContract] = useState('')
  const create = useMutation({
    mutationFn: () => post('/projects/', { client: clientId, tariff_version: Number(versionId), start_date: start, discount_percent: discount, contract_number: contract }),
    onSuccess: () => { onSaved(); onClose() },
  })
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate() }
  return (
    <Modal title="Yangi loyiha" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Tarif" hint="Narx shu kundagi tarif versiyasidan qotiriladi">
          <Select value={versionId} onChange={(e) => setVersionId(e.target.value)} required>
            <option value="">Tanlang…</option>
            {tariffs.data?.filter((t) => t.current_version).map((t) => (
              <option key={t.id} value={t.current_version!.id}>{t.name} — {money(t.current_version!.price, t.current_version!.currency)}/oy</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Boshlanish sanasi" hint="Har oy shu sanada hisob-faktura"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="Chegirma, %"><Input type="number" min="0" max="100" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        </div>
        <Field label="Shartnoma raqami"><Input value={contract} onChange={(e) => setContract(e.target.value)} /></Field>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>Loyihani ochish</Button>
      </form>
    </Modal>
  )
}

function AssignForm({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const users = useQuery({ queryKey: ['users', 'staff'], queryFn: () => get<Page<StaffUser>>('/users/', { staff: 1, page_size: 200 }) })
  const positions = useQuery({ queryKey: ['positions'], queryFn: () => get<Position[]>('/positions/') })
  const [user, setUser] = useState('')
  const [position, setPosition] = useState('')
  const [share, setShare] = useState('')
  const create = useMutation({
    mutationFn: () => post('/assignments/', { project: project.id, user: Number(user), position: Number(position), share_percent: share || null, started_at: today() }),
    onSuccess: () => { onSaved(); onClose() },
  })
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate() }
  return (
    <Modal title={`Jamoaga biriktirish · ${project.client_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Xodim">
          <Select value={user} onChange={(e) => {
            setUser(e.target.value)
            const picked = users.data?.results.find((u) => String(u.id) === e.target.value)
            if (picked?.positions[0]) setPosition(String(picked.positions[0].id))
          }} required>
            <option value="">Tanlang…</option>
            {users.data?.results.map((u) => <option key={u.id} value={u.id}>{u.full_name} — {u.role_label}</option>)}
          </Select>
        </Field>
        <Field label="Lavozim">
          <Select value={position} onChange={(e) => setPosition(e.target.value)} required>
            <option value="">Tanlang…</option>
            {positions.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Foiz (ixtiyoriy)" hint="Bo‘sh qoldirsangiz, maosh qoidasidagi foiz olinadi (20 / 12,5 / 12,5)">
          <Input type="number" min="0" max="100" step="0.01" value={share} onChange={(e) => setShare(e.target.value)} />
        </Field>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>Biriktirish</Button>
      </form>
    </Modal>
  )
}

function ContactForm({ clientId, onClose, onSaved }: { clientId: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ full_name: '', position: '', phone: '' })
  const create = useMutation({ mutationFn: () => post('/client-contacts/', { ...form, client: clientId }), onSuccess: () => { onSaved(); onClose() } })
  return (
    <Modal title="Kontakt" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <Field label="Ism familiya"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
        <Field label="Lavozimi"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
        <Field label="Telefon"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full">Saqlash</Button>
      </form>
    </Modal>
  )
}

function SocialForm({ clientId, onClose, onSaved }: { clientId: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ platform: 'instagram', username: '', followers_start: '0' })
  const create = useMutation({ mutationFn: () => post('/social-accounts/', { ...form, client: clientId }), onSuccess: () => { onSaved(); onClose() } })
  return (
    <Modal title="Ijtimoiy tarmoq akkaunti" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <Field label="Platforma">
          <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
            <option value="instagram">Instagram</option><option value="telegram">Telegram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option>
          </Select>
        </Field>
        <Field label="Username (@siz)"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace('@', '') })} required /></Field>
        <Field label="Boshlang‘ich obunachilar" hint="Agentlik ish boshlagan kundagi son — o‘sish shundan hisoblanadi">
          <Input type="number" min="0" value={form.followers_start} onChange={(e) => setForm({ ...form, followers_start: e.target.value })} />
        </Field>
        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full">Saqlash</Button>
      </form>
    </Modal>
  )
}

function InviteClientForm({ client, onClose }: { client: Client; onClose: () => void }) {
  const [form, setForm] = useState({ full_name: client.contacts[0]?.full_name ?? '', phone: client.contacts[0]?.phone ?? '+998 ' })
  const create = useMutation({ mutationFn: () => post<Invite>('/invites/', { ...form, role: 'client_owner', client: client.id }) })
  return (
    <Modal title="Mijoz kabinetiga taklif" onClose={onClose}>
      {create.data ? (
        <div className="space-y-3">
          <p>Havolani mijozga Telegram orqali yuboring. U 7 kun amal qiladi, mijoz o‘zi parol qo‘yadi.</p>
          <Input readOnly value={create.data.link ?? ''} onFocus={(e) => e.target.select()} />
          <Button className="w-full" onClick={() => navigator.clipboard?.writeText(create.data!.link ?? '')}>Nusxa olish</Button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
          <Field label="Ism familiya"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
          <Field label="Telefon (login)"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></Field>
          <ErrorBox error={create.error} />
          <Button type="submit" className="w-full" disabled={create.isPending}>Havola yaratish</Button>
        </form>
      )}
    </Modal>
  )
}
