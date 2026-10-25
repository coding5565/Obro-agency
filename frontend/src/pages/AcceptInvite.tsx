import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, get } from '../shared/api/client'
import type { Me } from '../shared/api/types'
import { useAuth } from '../shared/auth/AuthProvider'
import { Button, ErrorBox, Field, Input, Logo, Spinner } from '../shared/ui'
import { BrandPanel } from './Login'

export function AcceptInvitePage() {
  const { token = '' } = useParams()
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => get<{ full_name: string; phone: string; role_label: string }>(`/auth/invite/${token}/`),
    retry: false,
  })
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<unknown>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== repeat) return setError(new Error('Parollar bir xil emas'))
    try {
      const data = await api<{ access: string; user: Me }>(`/auth/invite/${token}/`, { method: 'POST', body: { password }, retry: false })
      acceptSession(data.access, data.user)
      navigate(data.user.is_client ? '/portal' : '/app', { replace: true })
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <div className="flex items-center justify-center p-6">
      <div className="w-full max-w-[360px] animate-enter">
        <Logo tone="dark" className="mb-6" />
        {invite.isLoading && <Spinner />}
        {invite.isError && <ErrorBox error={invite.error} />}
        {invite.data && (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-[20px] font-semibold">Xush kelibsiz, {invite.data.full_name}!</h2>
            <p className="text-muted">Siz OBRO’ Panel’ga «{invite.data.role_label}» sifatida taklif qilindingiz. Kirish uchun parol o‘ylab toping.</p>
            <Field label="Telefon"><Input value={invite.data.phone} disabled /></Field>
            <Field label="Yangi parol" hint="Kamida 10 belgi, faqat raqamdan iborat bo‘lmasin">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </Field>
            <Field label="Parolni takrorlang">
              <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
            </Field>
            <ErrorBox error={error} />
            <Button type="submit" className="w-full min-h-11">Akkauntni ochish</Button>
          </form>
        )}
      </div>
      </div>
    </div>
  )
}
