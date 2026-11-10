import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../shared/api/client'
import type { Me } from '../shared/api/types'
import { useAuth } from '../shared/auth/AuthProvider'
import { ErrorBox, Logo, Spinner } from '../shared/ui'

// Botdagi «Kabinetga kirish» havolasi: bir martalik token sessiyaga almashtiriladi.
export function TelegramLoginPage() {
  const { token = '' } = useParams()
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    api<{ access: string; user: Me }>('/auth/telegram/', { method: 'POST', body: { token } })
      .then((data) => {
        acceptSession(data.access, data.user)
        navigate(data.user.is_client ? '/portal' : '/app', { replace: true })
      })
      .catch(setError)
  }, [token, acceptSession, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink p-6 pt-[calc(env(safe-area-inset-top)+24px)] text-center text-ivory">
      <Logo size="md" />
      {error ? (
        <div className="w-full max-w-sm space-y-4">
          <ErrorBox error={error} />
          <Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-gold">Parol bilan kirish →</Link>
        </div>
      ) : <><Spinner /><p className="text-ivory/70">Kabinetga kirilmoqda…</p></>}
    </div>
  )
}
