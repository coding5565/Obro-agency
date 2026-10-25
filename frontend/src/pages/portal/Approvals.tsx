import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { get, post } from '../../shared/api/client'
import { dateTime } from '../../shared/lib/format'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Kicker, PageHeader, Spinner, Textarea } from '../../shared/ui'

interface PortalVersion { id: number; number: number; file_url: string | null; link: string; created_at: string }
interface ApprovalItem { id: number; kind: string; kind_label: string; title: string; caption: string; planned_date: string | null; version: PortalVersion | null; revisions_left: number }
interface ApprovalDetail extends ApprovalItem {
  history: { version_number: number; decision: string; comment: string; timecode: string; decided_by_name: string; created_at: string }[]
  can_decide: boolean
}

function Preview({ version }: { version: PortalVersion | null }) {
  if (!version) return null
  if (version.file_url) {
    // Video yoki rasm — fayl turini kengaytmadan emas, brauzerning o'zidan bilamiz.
    return (
      <div className="overflow-hidden rounded-xl bg-ink">
        <video src={version.file_url} controls playsInline className="mx-auto max-h-[70vh]" onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none' }} />
        <img src={version.file_url} alt="" className="mx-auto max-h-[70vh]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
    )
  }
  return <a href={version.link} target="_blank" rel="noreferrer" className="block rounded-xl bg-ivory p-4 font-semibold break-all text-bronze">Materialni ochish: {version.link}</a>
}

export function PortalApprovals() {
  const items = useQuery({ queryKey: ['portal', 'approvals'], queryFn: () => get<ApprovalItem[]>('/portal/approvals/') })
  return (
    <>
      <PageHeader title="Tasdiqlash" subtitle="Tayyor materiallarni ko‘rib, tasdiqlang yoki izoh qoldiring." />
      {items.isLoading && <Spinner />}
      {items.data?.length === 0 && <Card><Empty title="Hozircha tasdiq kutayotgan narsa yo‘q" hint="Jamoa yangi material tayyorlaganda shu yerda va bildirishnomalarda ko‘rasiz." /></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.data?.map((it) => (
          <Link key={it.id} to={`/portal/approvals/${it.id}`} className="group">
            <Card className="h-full transition group-hover:border-bronze">
              <div className="mb-3 flex h-36 items-center justify-center rounded-lg bg-gradient-to-br from-graphite to-ink text-[28px] text-gold">▶</div>
              <div className="num text-[10.5px] text-bronze uppercase">{it.kind_label} · v{it.version?.number}</div>
              <div className="font-semibold">{it.title}</div>
              <Button className="mt-3 w-full">Ko‘rish</Button>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}

export function PortalApprovalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const item = useQuery({ queryKey: ['portal', 'approval', id], queryFn: () => get<ApprovalDetail>(`/portal/approvals/${id}/`) })
  const [mode, setMode] = useState<'idle' | 'changes'>('idle')
  const [comment, setComment] = useState('')
  const [timecode, setTimecode] = useState('')
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'changes') => post(`/portal/approvals/${id}/`, { decision, comment, timecode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal'] })
      navigate('/portal/approvals')
    },
  })
  if (item.isLoading) return <Spinner />
  const it = item.data
  if (!it) return <ErrorBox error={item.error} />
  return (
    <>
      <PageHeader title={it.title} subtitle={`${it.kind_label} · versiya ${it.version?.number ?? '—'}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><Preview version={it.version} /></div>
        <div className="space-y-4">
          {it.caption && <Card><Kicker>Matn</Kicker><div className="whitespace-pre-line">{it.caption}</div></Card>}
          {it.can_decide ? (
            <Card>
              {mode === 'idle' ? (
                <div className="space-y-2">
                  <Button className="w-full py-2.5" onClick={() => decide.mutate('approve')} disabled={decide.isPending}><Check size={16} />Tasdiqlayman</Button>
                  <Button variant="ghost" className="w-full py-2.5" onClick={() => setMode('changes')}><MessageSquare size={16} />Izoh qoldirish</Button>
                  <p className="text-center text-[12px] text-muted">Tuzatish imkoniyati qoldi: {it.revisions_left}</p>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); decide.mutate('changes') }} className="space-y-3">
                  <Field label="Nimani o‘zgartirish kerak?"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} required autoFocus /></Field>
                  <Field label="Vaqt belgisi (ixtiyoriy)" hint="Masalan 0:12 — videoning qaysi joyi"><Input value={timecode} onChange={(e) => setTimecode(e.target.value)} placeholder="0:12" /></Field>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setMode('idle')}>Orqaga</Button>
                    <Button type="submit" variant="dark" className="flex-1" disabled={decide.isPending}>Yuborish</Button>
                  </div>
                </form>
              )}
              <ErrorBox error={decide.error} />
            </Card>
          ) : <Card><Badge tone="ok">Javob berilgan</Badge></Card>}
          {it.history.length > 0 && (
            <Card>
              <Kicker>Tarix</Kicker>
              {it.history.map((h, i) => (
                <div key={i} className="border-b border-line-soft py-2 text-[13px] last:border-0">
                  <Badge tone={h.decision === 'approved' ? 'ok' : 'warn'}>v{h.version_number} · {h.decision === 'approved' ? 'tasdiqlandi' : 'tuzatish'}</Badge>
                  {h.comment && <div className="mt-1">{h.timecode && <span className="num mr-1 text-bronze">{h.timecode}</span>}{h.comment}</div>}
                  <div className="text-[11px] text-muted">{h.decided_by_name} · {dateTime(h.created_at)}</div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
