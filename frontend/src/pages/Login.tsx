import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../shared/auth/AuthProvider'
import { Button, ErrorBox, Field, Input, Logo } from '../shared/ui'

// Slayddagi muqova uslubi: qora fon, katta oltin nishon, «OBRO» oltin, «AGENCY» och rangda.
export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-ink p-12 text-ivory lg:flex lg:flex-col lg:justify-between">
      <svg className="pointer-events-none absolute -top-36 -right-52 w-[500px]" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="27.6" fill="none" stroke="#ffc21f" strokeWidth="4.8" />
        <circle cx="32" cy="32" r="16" fill="none" stroke="#ffc21f" strokeWidth="4.8" />
        <circle cx="32" cy="32" r="5.8" fill="#ffc21f" />
      </svg>
      <Logo size="md" className="relative" />
      <div className="relative">
        <div className="font-display text-[88px] leading-[0.9] font-bold tracking-[-0.02em] text-gold">OBRO</div>
        <div className="font-display text-[34px] leading-none font-semibold tracking-[0.04em]">AGENCY</div>
        <div className="mono mt-5 text-[11px] tracking-[0.2em] text-muted-2 uppercase">Marketing · Content · Target · Growth</div>
        <p className="mt-8 max-w-md text-[17px] leading-relaxed text-ivory/85">
          Agentlik ishini <span className="accent text-[1.2em] text-gold">o‘z ko‘zingiz bilan</span> ko‘ring: kontent, tasdiqlash, natijalar va to‘lovlar bir joyda.
        </p>
      </div>
    </div>
  )
}

const DOORS = {
  client: {
    title: 'Mijoz', accent: 'kabineti',
    text: 'Telefon raqamingiz va parolingiz bilan kiring.',
    note: 'Akkaunt agentlik tomonidan ochiladi. Parolni unutgan bo‘lsangiz, SMM menejeringizga yozing.',
  },
  staff: {
    title: 'Jamoa', accent: 'paneli',
    text: 'OBRO AGENCY xodimlari uchun kirish.',
    note: 'Akkauntni rahbar ochadi. Parolni unutgan bo‘lsangiz, rahbarga yozing.',
  },
}

export function LoginPage({ door = 'client' }: { door?: keyof typeof DOORS }) {
  const copy = DOORS[door]
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [phone, setPhone] = useState('+998 ')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={user.is_client ? '/portal' : '/app'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const me = await login(phone, password)
      const from = (location.state as { from?: string } | null)?.from
      const fits = from && from.startsWith(me.is_client ? '/portal' : '/app')
      navigate(fits ? from : me.is_client ? '/portal' : '/app', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-[360px] animate-enter space-y-5">
          <Logo tone="dark" size="md" className="mb-4 lg:hidden" />
          <div>
            <h1 className="font-display text-[26px] font-semibold">{copy.title} <span className="accent text-[1.15em]">{copy.accent}</span></h1>
            <p className="mt-1.5 text-muted">{copy.text}</p>
          </div>
          <Field label="Telefon raqam">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="username" required />
          </Field>
          <Field label="Parol">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" className="w-full min-h-11" disabled={busy}>{busy ? 'Kirilmoqda…' : 'Kirish'}</Button>
          <p className="text-[12.5px] text-muted">{copy.note}</p>
          <Link to="/" className="inline-flex min-h-9 items-center text-[13px] font-semibold text-bronze">← Bosh sahifaga qaytish</Link>
        </form>
      </div>
    </div>
  )
}
