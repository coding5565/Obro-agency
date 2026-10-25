import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, onUnauthorized, refreshSession, setAccessToken } from '../api/client'
import type { Me } from '../api/types'

interface AuthState {
  user: Me | null
  loading: boolean
  login: (phone: string, password: string) => Promise<Me>
  acceptSession: (access: string, user: Me) => void
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  can: (permission: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    onUnauthorized(() => {
      setAccessToken(null)
      setUser(null)
    })
    // Sahifa yangilanganda sessiyani cookie orqali tiklaymiz.
    refreshSession()
      .then(async (ok) => {
        if (ok) setUser(await api<Me>('/auth/me/'))
      })
      .finally(() => setLoading(false))
  }, [])

  const acceptSession = useCallback((access: string, me: Me) => {
    setAccessToken(access)
    setUser(me)
  }, [])

  const login = useCallback(async (phone: string, password: string) => {
    const data = await api<{ access: string; user: Me }>('/auth/login/', {
      method: 'POST',
      body: { phone, password },
      retry: false,
    })
    acceptSession(data.access, data.user)
    return data.user
  }, [acceptSession])

  const logout = useCallback(async () => {
    await api('/auth/logout/', { method: 'POST', body: {}, retry: false }).catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  const can = useCallback((permission: string) => !!user?.permissions.includes(permission), [user])

  const refreshUser = useCallback(async () => {
    setUser(await api<Me>('/auth/me/'))
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, can, acceptSession, refreshUser }),
    [user, loading, login, logout, can, acceptSession, refreshUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatiladi')
  return ctx
}
