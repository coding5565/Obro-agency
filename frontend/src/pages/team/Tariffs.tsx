import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { get, post } from '../../shared/api/client'
import type { Service, Tariff } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { date, money, today } from '../../shared/lib/format'
import { Badge, Button, Card, ErrorBox, Field, Input, Kicker, Modal, PageHeader, Select, Spinner } from '../../shared/ui'

export function TariffsPage() {
  const { can } = useAuth()
  const tariffs = useQuery({ queryKey: ['tariffs'], queryFn: () => get<Tariff[]>('/catalog/tariffs/') })
  const features = useQuery({ queryKey: ['features'], queryFn: () => get<{ code: string; label: string }[]>('/catalog/tariffs/features/') })
  const services = useQuery({ queryKey: ['services'], queryFn: () => get<Service[]>('/catalog/services/') })
  const [editing, setEditing] = useState<Tariff | null>(null)
  const labels = new Map(features.data?.map((f) => [f.code, f.label]))
  if (tariffs.isLoading) return <Spinner />
  return (
    <>
      <PageHeader title="Tariflar va xizmatlar" subtitle="Narx o‘zgarsa yangi versiya qo‘shiladi. Ishlab turgan loyihalar eski narxda qoladi." />
      <div className="grid gap-4 lg:grid-cols-3">
        {tariffs.data?.map((t) => {
          const v = t.current_version
          return (
            <Card key={t.id} cut className={t.code === 'standard' ? 'border-gold' : ''}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 font-display text-[18px] font-semibold">{t.name}</div>
                {t.code === 'standard' && <Badge tone="dark">ENG MAQBUL</Badge>}
              </div>
              {v && (
                <>
                  <div className="num mt-1 text-[26px] font-bold">{money(v.price, v.currency)}<span className="text-[13px] font-normal text-muted"> / oy</span></div>
                  <div className="text-[12px] text-muted">{date(v.valid_from)} dan · tuzatish {v.revisions_per_item} marta</div>
                  <div className="mt-3 space-y-1">
                    {v.limits.map((l) => <div key={l.content_kind} className="flex justify-between border-b border-line-soft py-1"><span className="capitalize">{l.content_kind}</span><b className="num">{l.quantity}</b></div>)}
                  </div>
                  <Kicker className="mt-5">Mijoz panelida</Kicker>
                  <div className="flex flex-wrap gap-1">{v.panel_features.map((f) => <Badge key={f} tone="draft">{labels.get(f) ?? f}</Badge>)}</div>
                </>
              )}
              <p className="mt-3 text-[12.5px] text-muted">{t.description}</p>
              {can('catalog.manage') && <Button variant="ghost" className="mt-3 w-full" onClick={() => setEditing(t)}>Yangi narx / tarkib</Button>}
            </Card>
          )
        })}
      </div>
      <Card className="mt-4">
        <Kicker>Qo‘shimcha xizmatlar (alohida kelishuv asosida)</Kicker>
        {services.data?.map((s) => (
          <div key={s.id} className="flex justify-between border-b border-line-soft py-1.5 last:border-0">
            <span>{s.name}</span><span className="text-muted">{s.price_negotiable ? 'kelishiladi' : money(s.price, s.currency)} / {s.unit_label}</span>
          </div>
        ))}
      </Card>
      {editing && <VersionForm tariff={editing} features={features.data ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}

function VersionForm({ tariff, features, onClose }: { tariff: Tariff; features: { code: string; label: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const current = tariff.current_version
  const limit = (kind: string) => String(current?.limits.find((l) => l.content_kind === kind)?.quantity ?? 0)
  const [form, setForm] = useState({
    price: current?.price ?? '', currency: current?.currency ?? 'USD', valid_from: today(),
    revisions: String(current?.revisions_per_item ?? 2), post: limit('post'), reels: limit('reels'), stories: limit('stories'),
  })
  const [selected, setSelected] = useState<string[]>(current?.panel_features ?? [])
  const save = useMutation({
    mutationFn: () => post('/catalog/tariff-versions/', {
      tariff: tariff.id, price: form.price, currency: form.currency, valid_from: form.valid_from, revisions_per_item: Number(form.revisions),
      panel_features: selected,
      limits: (['post', 'reels', 'stories'] as const).map((k) => ({ content_kind: k, quantity: Number(form[k]) })),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tariffs'] }); onClose() },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <Modal title={`${tariff.name} — yangi versiya`} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Narx"><Input type="number" step="0.01" value={form.price} onChange={set('price')} required /></Field>
          <Field label="Valyuta"><Select value={form.currency} onChange={set('currency')}><option>USD</option><option>UZS</option></Select></Field>
          <Field label="Qachondan"><Input type="date" value={form.valid_from} onChange={set('valid_from')} required /></Field>
          <Field label="Post"><Input type="number" min="0" value={form.post} onChange={set('post')} /></Field>
          <Field label="Reels"><Input type="number" min="0" value={form.reels} onChange={set('reels')} /></Field>
          <Field label="Stories"><Input type="number" min="0" value={form.stories} onChange={set('stories')} /></Field>
          <Field label="Tuzatishlar soni"><Input type="number" min="0" value={form.revisions} onChange={set('revisions')} /></Field>
        </div>
        <Field label="Mijoz panelida ochiq bo‘limlar">
          <div className="grid grid-cols-2 gap-1.5">
            {features.map((f) => (
              <label key={f.code} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={selected.includes(f.code)} onChange={(e) => setSelected(e.target.checked ? [...selected, f.code] : selected.filter((x) => x !== f.code))} />
                {f.label}
              </label>
            ))}
          </div>
        </Field>
        <ErrorBox error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Versiyani saqlash</Button>
      </form>
    </Modal>
  )
}
