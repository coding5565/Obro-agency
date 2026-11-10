import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bell, Lock, LogOut, Menu, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { get } from '../shared/api/client'
import { useAuth } from '../shared/auth/AuthProvider'
import { InstallApp } from '../shared/InstallApp'
import { Logo } from '../shared/ui'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  badge?: number
  locked?: string
  section?: string
}

export interface QuickItem { to: string; label: string; icon: ReactNode }

function initials(name?: string) {
  return (name ?? '').split(' ').filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// Umumiy qobiq: chapda qora menyu (slayddagi 30% qora), faol bo'lim oltin nuqta bilan belgilanadi.
export function Shell({ nav, footer, quick = [], bottom }: { nav: NavItem[]; footer?: ReactNode; quick?: QuickItem[]; bottom?: ReactNode }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    if (!adding) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdding(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [adding])
  const location = useLocation()
  const portal = location.pathname.startsWith('/portal')
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => get<{ count: number }>('/notifications/unread-count/'),
    refetchInterval: 60_000,
  })

  const menu = (
    <nav className="flex h-full flex-col" aria-label="Asosiy menyu">
      <Link to={portal ? '/portal' : '/app'} className="mb-8 block px-2 pt-1"><Logo size="sm" /></Link>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {nav.map((item, index) => {
          const header = item.section && item.section !== nav[index - 1]?.section
            ? <div key={`s-${item.section}`} className="mono px-3 pt-4 pb-1.5 text-[10px] tracking-[0.16em] text-muted uppercase">{item.section}</div>
            : null
          const link = item.locked ? (
            <div key={item.to} title={item.locked} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] text-muted">
              <span className="w-1.5" />
              <span className="opacity-60">{item.icon}</span>
              {item.label}
              <Lock size={13} className="ml-auto opacity-70" />
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx('group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors duration-150',
                  isActive ? 'bg-ink-3 font-bold text-ivory' : 'text-muted-2 hover:bg-ink-2 hover:text-ivory')}
            >
              {({ isActive }) => (
                <>
                  <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full transition-colors', isActive ? 'bg-gold' : 'bg-transparent')} />
                  <span className={clsx('shrink-0', isActive ? 'text-gold' : 'opacity-80')}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {!!item.badge && <span className="num ml-auto rounded-full bg-gold px-2 text-[11px] leading-5 font-bold text-ink">{item.badge}</span>}
                </>
              )}
            </NavLink>
          )
          return <div key={item.to}>{header}{link}</div>
        })}
      </div>
      <div className="mt-6 border-t border-ink-3 pt-4">
        {footer && <div className="mb-3 px-1 text-[12px]">{footer}</div>}
        <InstallApp look="sidebar" label="Telefonga o‘rnatish" className="mb-3" />
        {bottom}
        <div className="flex items-center gap-1">
          <Link to={portal ? '/portal/profile' : '/app/profile'} onClick={() => setOpen(false)} title="Profil: Telegram va parol"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-ink-2">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-3 font-display text-[11px] font-bold text-gold">
              {initials(user?.full_name)}
              {user && !user.telegram_linked && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-ink" title="Telegram ulanmagan" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-ivory">{user?.full_name}</div>
              <div className="truncate text-[11.5px] text-muted-2">{user?.telegram_linked ? user?.role_label : 'Telegram’ni ulash →'}</div>
            </div>
          </Link>
          <button onClick={logout} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-2 transition-colors hover:bg-ink-3 hover:text-ivory" title="Chiqish" aria-label="Chiqish"><LogOut size={17} /></button>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 bg-ink px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+20px)] lg:block">{menu}</aside>
      {open && (
        <div className="fixed inset-0 z-40 animate-fade bg-ink/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-[min(272px,85vw)] animate-enter bg-ink pr-4 pl-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+20px)]" onClick={(e) => e.stopPropagation()}>{menu}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 box-content flex h-14 items-center justify-between gap-3 border-b border-line-soft bg-paper/90 px-4 pt-[env(safe-area-inset-top)] pr-[max(16px,env(safe-area-inset-right))] pl-[max(16px,env(safe-area-inset-left))] backdrop-blur-md lg:px-10">
          <div className="flex items-center gap-2">
            <button className="-ml-2 grid h-10 w-10 place-items-center rounded-xl hover:bg-ivory lg:hidden" onClick={() => setOpen(!open)} aria-label="Menyu">{open ? <X size={20} /> : <Menu size={20} />}</button>
            <span className="mono text-[10.5px] tracking-[0.14em] text-muted uppercase">{portal ? 'Mijoz kabineti' : 'OBRO’ Panel'}</span>
          </div>
          <div className="flex items-center gap-1">
          {quick.length > 0 && (
            <div className="relative">
              <button type="button" onClick={() => setAdding(!adding)} aria-expanded={adding} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3 text-[13px] font-bold text-ivory">
                <Plus size={16} />Qo‘shish
              </button>
              {adding && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAdding(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-line-soft bg-white py-1.5 shadow-raise">
                    {quick.map((q) => (
                      <Link key={q.to} to={q.to} onClick={() => setAdding(false)} className="flex min-h-11 items-center gap-3 px-4 text-[14px] font-semibold hover:bg-ivory">
                        <span className="text-bronze">{q.icon}</span>{q.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <Link to={portal ? '/portal/notifications' : '/app/notifications'} className="relative grid h-10 w-10 place-items-center rounded-xl text-text-2 transition-colors hover:bg-white hover:text-ink" aria-label="Bildirishnomalar">
            <Bell size={19} />
            {!!unread.data?.count && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-paper" />}
          </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1180px] animate-enter px-4 pt-7 pb-[calc(env(safe-area-inset-bottom)+28px)] lg:px-10 lg:pt-9" key={location.pathname}><Outlet /></main>
      </div>
    </div>
  )
}
