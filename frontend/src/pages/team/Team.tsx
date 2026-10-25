import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { get, post } from '../../shared/api/client'
import type { Invite, Page, Position, StaffUser } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { dateTime } from '../../shared/lib/format'
import { Badge, Button, Card, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Table } from '../../shared/ui'

const STAFF_ROLES: [string, string][] = [['smm', 'SMM menejer'], ['creator', 'Ijodkor'], ['freelancer', 'Frilanser'], ['brandface', 'Brendfeys'], ['rahbar', 'Rahbar']]

export function TeamPage() {
  const { user, can } = useAuth()
  const queryClient = useQueryClient()
  const [inviting, setInviting] = useState(false)
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => get<Page<StaffUser>>('/users/', { page_size: 300 }) })
  const invites = useQuery({ queryKey: ['invites'], queryFn: () => get<Page<Invite>>('/invites/'), enabled: can('users.manage') })
  const toggle = useMutation({
    mutationFn: (u: StaffUser) => post(`/users/${u.id}/${u.is_active ? 'deactivate' : 'activate'}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
  const pending = invites.data?.results.filter((i) => i.is_usable) ?? []
  return (
    <>
      <PageHeader title="Jamoa va akkauntlar" actions={can('users.manage') && <Button onClick={() => setInviting(true)}><UserPlus size={16} />Xodim taklif qilish</Button>} />
      {pending.length > 0 && (
        <Card className="mb-4">
          <Kicker>Kutilayotgan takliflar</Kicker>
          {pending.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-line-soft py-2 last:border-0">
              <span className="font-semibold">{i.full_name}</span><span className="num text-muted">{i.phone}</span>
              <Button variant="ghost" className="ml-auto" onClick={() => navigator.clipboard?.writeText(i.link ?? '')}>Havolani nusxalash</Button>
            </div>
          ))}
        </Card>
      )}
      <ErrorBox error={toggle.error} />
      <Table head={['Ism', 'Telefon', 'Rol', 'Lavozim', 'Oxirgi kirish', '']}>
        {users.data?.results.map((u) => (
          <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
            <td className="font-semibold">{u.full_name}</td>
            <td className="num">{u.phone}</td>
            <td>{u.role_label}</td>
            <td className="text-[12.5px]">{u.positions.map((p) => p.name).join(', ') || '—'}</td>
            <td className="num text-[12px]">{dateTime(u.last_login)}</td>
            <td className="text-right">
              {can('users.manage') && u.id !== user?.id && (u.role !== 'super_admin' || user?.role === 'super_admin') && (
                u.is_active
                  ? <Button variant="danger" onClick={() => confirm(`${u.full_name} akkaunti o‘chirilsinmi? Tarix saqlanadi.`) && toggle.mutate(u)}>O‘chirish</Button>
                  : <Button variant="ghost" onClick={() => toggle.mutate(u)}>Qayta yoqish</Button>
              )}
              {!u.is_active && <Badge>o‘chirilgan</Badge>}
            </td>
          </tr>
        ))}
      </Table>
      {inviting && <InviteForm onClose={() => setInviting(false)} />}
    </>
  )
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const positions = useQuery({ queryKey: ['positions'], queryFn: () => get<Position[]>('/positions/') })
  const [form, setForm] = useState({ full_name: '', phone: '+998 ', role: 'creator' })
  const [selected, setSelected] = useState<number[]>([])
  const create = useMutation({
    mutationFn: () => post<Invite>('/invites/', { ...form, position_ids: selected }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
  })
  return (
    <Modal title="Xodim taklif qilish" onClose={onClose}>
      {create.data ? (
        <div className="space-y-3">
          <p>Havolani xodimga yuboring. U 7 kun amal qiladi, xodim o‘zi parol qo‘yadi.</p>
          <Input readOnly value={create.data.link ?? ''} onFocus={(e) => e.target.select()} />
          <Button className="w-full" onClick={() => navigator.clipboard?.writeText(create.data!.link ?? '')}>Nusxa olish</Button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
          <Field label="Ism familiya"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
          <Field label="Telefon (login)"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></Field>
          <Field label="Rol"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{STAFF_ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Lavozim (maosh uchun)" hint="Bir kishiga ikki lavozim berilishi mumkin">
            <div className="space-y-1">
              {positions.data?.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
          </Field>
          <ErrorBox error={create.error} />
          <Button type="submit" className="w-full" disabled={create.isPending}>Havola yaratish</Button>
        </form>
      )}
    </Modal>
  )
}
