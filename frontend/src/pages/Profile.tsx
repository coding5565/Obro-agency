import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, get, post } from '../shared/api/client'
import { useAuth } from '../shared/auth/AuthProvider'
import { dateTime } from '../shared/lib/format'
import { Badge, Button, Card, ErrorBox, Field, Input, Kicker, PageHeader } from '../shared/ui'

interface LinkState { linked: boolean; username: string; linked_at: string | null; bot: string | null }

export function ProfilePage() {
  const { user } = useAuth()
  return (
    <>
      <PageHeader title="Profil" subtitle={`${user?.full_name} · ${user?.role_label} · ${user?.phone}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TelegramCard />
        <PasswordCard />
      </div>
    </>
  )
}

function TelegramCard() {
  const queryClient = useQueryClient()
  const { refreshUser } = useAuth()
  const [waiting, setWaiting] = useState(false)
  // Havola ochilgandan keyin foydalanuvchi Telegram'da «Start» bosguncha holatni har 4 soniyada tekshiramiz.
  const state = useQuery({
    queryKey: ['telegram-link'],
    queryFn: () => get<LinkState>('/telegram/link/'),
    refetchInterval: (query) => (waiting && !query.state.data?.linked ? 4000 : false),
  })
  const create = useMutation({
    mutationFn: () => post<{ url: string }>('/telegram/link/'),
    onSuccess: (data) => {
      setWaiting(true)
      window.open(data.url, '_blank', 'noopener')
    },
  })
  const remove = useMutation({
    mutationFn: () => api('/telegram/link/', { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['telegram-link'] })
      await refreshUser()
    },
  })
  const s = state.data
  useEffect(() => {
    if (waiting && s?.linked) {
      setWaiting(false)
      refreshUser()
    }
  }, [waiting, s?.linked, refreshUser])
  return (
    <Card>
      <Kicker>Telegram</Kicker>
      {s?.linked ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok" dot>Ulangan</Badge>
            {s.username && <span className="font-semibold">@{s.username}</span>}
            <span className="text-[12.5px] text-muted">{dateTime(s.linked_at)}</span>
          </div>
          <p className="mt-3 text-[13.5px] text-text-2">Yangi vazifa, mijoz javobi va eslatmalar Telegram’ga keladi.</p>
          <Button variant="ghost" className="mt-4" onClick={() => remove.mutate()} disabled={remove.isPending}>Uzish</Button>
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-text-2">
            Ulasangiz, bildirishnomalar Telegram’ga keladi. Mijozlar materialni botning o‘zida tasdiqlay oladi,
            jamoa esa /jurnal buyrug‘i bilan ishini 1 daqiqada yozadi.
          </p>
          {s && !s.bot && <p className="mt-3 rounded-xl bg-ivory px-3 py-2 text-[12.5px] text-muted">Bot hali sozlanmagan. Rahbar bot tokenini qo‘ygach, shu tugma ishlaydi.</p>}
          <Button className="mt-4" onClick={() => create.mutate()} disabled={create.isPending || !s?.bot}><Send size={15} />Telegram’ni ulash</Button>
          {create.data && (
            <p className="mt-3 text-[12.5px] text-muted">
              Telegram ochilmadimi? <a className="font-semibold text-bronze" href={create.data.url} target="_blank" rel="noreferrer">Shu havolani bosing</a>, so‘ng «Start».
              Havola 15 daqiqa amal qiladi.
            </p>
          )}
          <div className="mt-3"><ErrorBox error={create.error} /></div>
        </>
      )}
    </Card>
  )
}

function PasswordCard() {
  const [form, setForm] = useState({ old_password: '', new_password: '', repeat: '' })
  const save = useMutation({
    mutationFn: () => {
      if (form.new_password !== form.repeat) throw new Error('Yangi parollar bir xil emas')
      return post('/auth/password/', { old_password: form.old_password, new_password: form.new_password })
    },
    onSuccess: () => setForm({ old_password: '', new_password: '', repeat: '' }),
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Card>
      <Kicker>Parolni o‘zgartirish</Kicker>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <Field label="Hozirgi parol"><Input type="password" value={form.old_password} onChange={set('old_password')} autoComplete="current-password" required /></Field>
        <Field label="Yangi parol" hint="Kamida 10 belgi, faqat raqamdan iborat bo‘lmasin"><Input type="password" value={form.new_password} onChange={set('new_password')} autoComplete="new-password" required /></Field>
        <Field label="Yangi parolni takrorlang"><Input type="password" value={form.repeat} onChange={set('repeat')} autoComplete="new-password" required /></Field>
        <ErrorBox error={save.error} />
        {save.isSuccess && <div className="rounded-xl bg-ok-soft px-3 py-2 text-[13px] font-semibold text-ok">Parol o‘zgartirildi</div>}
        <Button type="submit" disabled={save.isPending}>Saqlash</Button>
      </form>
    </Card>
  )
}
