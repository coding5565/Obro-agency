import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { get, post } from '../shared/api/client'
import type { Notification, Page } from '../shared/api/types'
import { dateTime } from '../shared/lib/format'
import { Button, Card, Empty, PageHeader, Spinner } from '../shared/ui'

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => get<Page<Notification>>('/notifications/') })
  const readAll = useMutation({
    mutationFn: () => post('/notifications/read-all/'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] }),
  })
  // Sahifa ochilganda xabarlar o'qilgan hisoblanadi (ro'yxatda yangilari baribir ajralib turadi).
  const hasUnread = !!list.data?.results.some((n) => !n.read_at)
  const { mutate: markAll } = readAll
  useEffect(() => {
    if (hasUnread) markAll()
  }, [hasUnread, markAll])
  return (
    <>
      <PageHeader title="Bildirishnomalar" actions={<Button variant="ghost" onClick={() => readAll.mutate()}>Hammasini o‘qildi qilish</Button>} />
      {list.isLoading && <Spinner />}
      {list.data?.results.length === 0 && <Empty title="Hozircha xabar yo‘q" />}
      <div className="space-y-2">
        {list.data?.results.map((n) => (
          <Card key={n.id} className={n.read_at ? 'opacity-70' : ''}>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-line' : 'bg-gold'}`} />
              <div className="min-w-0 flex-1">
                {n.link ? <Link to={n.link} className="font-semibold hover:underline">{n.title}</Link> : <div className="font-semibold">{n.title}</div>}
                {n.body && <div className="mt-0.5 text-muted">{n.body}</div>}
              </div>
              <div className="num shrink-0 text-[11px] text-muted">{dateTime(n.created_at)}</div>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
