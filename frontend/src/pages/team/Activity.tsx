import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { get } from '../../shared/api/client'
import type { Page } from '../../shared/api/types'
import { date, today } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner } from '../../shared/ui'

interface Entry {
  id: number
  actor: number | null
  actor_name: string | null
  action: string
  label: string
  detail: string
  section: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

interface Filters { sections: { key: string; label: string }[]; actors: { id: number; name: string }[] }

const HIDDEN = new Set(['id', 'password', 'updated_at', 'created_at', 'token'])

function changes(entry: Entry) {
  if (!entry.before || !entry.after) return []
  return Object.keys(entry.after).filter((key) => !HIDDEN.has(key) && JSON.stringify(entry.before?.[key]) !== JSON.stringify(entry.after?.[key]))
    .map((key) => ({ key, from: String(entry.before?.[key] ?? '—'), to: String(entry.after?.[key] ?? '—') }))
}

function time(value: string) {
  const d = new Date(value)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayKey(value: string) {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function initials(name: string | null) {
  return (name ?? 'T').split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export function ActivityPage() {
  const [section, setSection] = useState('')
  const [actor, setActor] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const filters = useQuery({ queryKey: ['audit', 'filters'], queryFn: () => get<Filters>('/audit/filters/') })
  const list = useInfiniteQuery({
    queryKey: ['audit', section, actor, from, to, search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => get<Page<Entry>>('/audit/', { page: pageParam, page_size: 50, section, actor, from, to, search }),
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    refetchInterval: 30_000,
  })
  const days = useMemo(() => {
    const groups = new Map<string, Entry[]>()
    list.data?.pages.flatMap((page) => page.results).forEach((entry) => {
      const key = dayKey(entry.created_at)
      groups.set(key, [...(groups.get(key) ?? []), entry])
    })
    return [...groups.entries()]
  }, [list.data])
  const total = list.data?.pages[0]?.count ?? 0
  return (
    <>
      <PageHeader title="Harakatlar" subtitle="Tizimda kim, qachon, nima qilgani. Yozuvlarni hech kim o‘zgartira olmaydi." />
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Field label="Bo‘lim"><Select value={section} onChange={(e) => setSection(e.target.value)}><option value="">Hammasi</option>{filters.data?.sections.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
          <Field label="Kim"><Select value={actor} onChange={(e) => setActor(e.target.value)}><option value="">Hamma</option>{filters.data?.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Sanadan"><Input type="date" max={today()} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Sanagacha"><Input type="date" max={today()} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="col-span-2 lg:col-span-1"><Field label="Qidirish"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Masalan: to‘lov" /></Field></div>
        </div>
      </Card>
      <ErrorBox error={list.error} />
      {list.isLoading ? <Spinner /> : total === 0 ? <Empty title="Harakat topilmadi" hint="Filtrni o‘zgartirib ko‘ring." /> : (
        <>
          <p className="mb-3 text-[13px] text-muted">Jami {total} ta yozuv</p>
          <div className="space-y-5">
            {days.map(([day, entries]) => (
              <section key={day}>
                <h2 className="mono mb-2 text-[11.5px] tracking-[0.12em] text-muted uppercase">{day === today() ? 'Bugun' : date(day)}</h2>
                <Card className="divide-y divide-line-soft py-1">
                  {entries.map((entry) => {
                    const diff = changes(entry)
                    return (
                      <div key={entry.id} className="flex gap-3 py-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-[11.5px] font-bold text-gold">{initials(entry.actor_name)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="break-words"><b>{entry.actor_name ?? 'Tizim'}</b> <span className="text-text-2">{entry.label}</span></div>
                          {entry.detail && <div className="mt-0.5 text-[13px] break-words text-muted">{entry.detail}</div>}
                          {diff.length > 0 && (
                            <details className="mt-1 text-[12.5px]">
                              <summary className="min-h-8 cursor-pointer font-semibold text-bronze">{diff.length} ta o‘zgarish</summary>
                              <div className="space-y-0.5 pb-1">
                                {diff.map((c) => <div key={c.key} className="break-words"><span className="mono text-muted">{c.key}:</span> {c.from} → <b>{c.to}</b></div>)}
                              </div>
                            </details>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2"><span className="num text-[12px] text-muted">{time(entry.created_at)}</span><Badge>{entry.section}</Badge></div>
                        </div>
                      </div>
                    )
                  })}
                </Card>
              </section>
            ))}
          </div>
          {list.hasNextPage && <div className="mt-4 text-center"><Button variant="ghost" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? 'Yuklanmoqda…' : 'Yana ko‘rsatish'}</Button></div>}
        </>
      )}
    </>
  )
}
