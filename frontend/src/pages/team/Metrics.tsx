import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { get, post } from '../../shared/api/client'
import type { Client, Page } from '../../shared/api/types'
import { date, num, pct, today } from '../../shared/lib/format'
import { Button, Card, Empty, ErrorBox, Field, Input, Kicker, PageHeader, Select, Table } from '../../shared/ui'
import { useActiveProjects } from './Content'

interface Snapshot { id: number; account: string; date: string; followers: number; reach: number; impressions: number; profile_visits: number; engagement_rate: string }
interface Campaign { id: number; name: string; status: string; client_name: string }
interface AdStat { id: number; campaign: number; date: string; spend: string; currency: string; clicks: number; leads: number; impressions: number }

export function MetricsPage() {
  const projects = useActiveProjects()
  const [picked, setProjectId] = useState('')
  const projectId = picked || String(projects.data?.results[0]?.id ?? '')
  const project = projects.data?.results.find((p) => String(p.id) === projectId)
  return (
    <>
      <PageHeader title="Ko‘rsatkichlar" subtitle="Haftasiga bir marta kiriting. Mijoz panelida grafik bo‘lib ko‘rinadi." />
      <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mb-4 max-w-xs">
        {projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
      </Select>
      {project && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AccountMetrics clientId={project.client} />
          <AdsBlock projectId={project.id} />
        </div>
      )}
    </>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
}

function AccountMetrics({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient()
  const client = useQuery({ queryKey: ['client', String(clientId)], queryFn: () => get<Client>(`/clients/${clientId}/`) })
  const snaps = useQuery({ queryKey: ['snapshots', clientId], queryFn: () => get<Page<Snapshot>>('/metrics/snapshots/', { social_account__client: clientId }) })
  const [form, setForm] = useState({ social_account: '', date: today(), followers: '', reach: '', impressions: '', profile_visits: '', engagement_rate: '' })
  const account = form.social_account || String(client.data?.social_accounts[0]?.id ?? '')
  const save = useMutation({
    mutationFn: () => post('/metrics/snapshots/', {
      ...form, social_account: Number(account), followers: Number(form.followers), reach: Number(form.reach || 0),
      impressions: Number(form.impressions || 0), profile_visits: Number(form.profile_visits || 0), engagement_rate: form.engagement_rate || '0',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots', clientId] })
      setForm({ ...form, followers: '', reach: '', impressions: '', profile_visits: '', engagement_rate: '' })
    },
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  if (client.data && client.data.social_accounts.length === 0) {
    return <Card><Empty title="Akkaunt qo‘shilmagan" hint="Mijoz sahifasida Instagram akkauntini qo‘shing." /></Card>
  }
  return (
    <Card>
      <Kicker>Akkaunt ko‘rsatkichlari</Kicker>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <Row>
          <Field label="Akkaunt">
            <Select value={account} onChange={set('social_account')}>
              {client.data?.social_accounts.map((s) => <option key={s.id} value={s.id}>@{s.username}</option>)}
            </Select>
          </Field>
          <Field label="Sana"><Input type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label="Obunachilar"><Input type="number" min="0" value={form.followers} onChange={set('followers')} required /></Field>
          <Field label="Qamrov (7 kun)"><Input type="number" min="0" value={form.reach} onChange={set('reach')} /></Field>
          <Field label="Profilga tashrif"><Input type="number" min="0" value={form.profile_visits} onChange={set('profile_visits')} /></Field>
          <Field label="ER, %"><Input type="number" min="0" step="0.01" value={form.engagement_rate} onChange={set('engagement_rate')} /></Field>
        </Row>
        <ErrorBox error={save.error} />
        <Button type="submit" disabled={save.isPending}>Saqlash</Button>
      </form>
      <div className="mt-4">
        <Table head={['Sana', 'Obunachi', 'Qamrov', 'ER']}>
          {snaps.data?.results.map((s) => (
            <tr key={s.id}><td className="num">{date(s.date)}</td><td className="num">{num(s.followers)}</td><td className="num">{num(s.reach)}</td><td className="num">{pct(s.engagement_rate)}</td></tr>
          ))}
        </Table>
      </div>
    </Card>
  )
}

function AdsBlock({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient()
  const campaigns = useQuery({ queryKey: ['campaigns', projectId], queryFn: () => get<Page<Campaign>>('/ads/campaigns/', { project: projectId }) })
  const stats = useQuery({ queryKey: ['adstats', projectId], queryFn: () => get<Page<AdStat>>('/ads/stats/', { campaign__project: projectId }) })
  const [name, setName] = useState('')
  const [form, setForm] = useState({ campaign: '', date: today(), spend: '', currency: 'USD', impressions: '', clicks: '', leads: '' })
  const addCampaign = useMutation({
    mutationFn: () => post('/ads/campaigns/', { project: projectId, name, started_on: today() }),
    onSuccess: () => { setName(''); queryClient.invalidateQueries({ queryKey: ['campaigns', projectId] }) },
  })
  const campaignId = form.campaign || String(campaigns.data?.results[0]?.id ?? '')
  const addStat = useMutation({
    mutationFn: () => post('/ads/stats/', { ...form, campaign: Number(campaignId), impressions: Number(form.impressions || 0), clicks: Number(form.clicks || 0), leads: Number(form.leads || 0) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adstats', projectId] }),
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  const names = new Map(campaigns.data?.results.map((c) => [c.id, c.name]))
  return (
    <Card>
      <Kicker>Target reklama</Kicker>
      <form onSubmit={(e) => { e.preventDefault(); addCampaign.mutate() }} className="mb-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yangi kampaniya nomi" required />
        <Button type="submit" variant="dark">Qo‘shish</Button>
      </form>
      {!!campaigns.data?.results.length && (
        <form onSubmit={(e) => { e.preventDefault(); addStat.mutate() }} className="space-y-3">
          <Row>
            <Field label="Kampaniya"><Select value={campaignId} onChange={set('campaign')}>{campaigns.data.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Sana"><Input type="date" value={form.date} onChange={set('date')} /></Field>
            <Field label="Sarf"><Input type="number" min="0" step="0.01" value={form.spend} onChange={set('spend')} required /></Field>
            <Field label="Valyuta"><Select value={form.currency} onChange={set('currency')}><option>USD</option><option>UZS</option></Select></Field>
            <Field label="Bosishlar"><Input type="number" min="0" value={form.clicks} onChange={set('clicks')} /></Field>
            <Field label="Lidlar"><Input type="number" min="0" value={form.leads} onChange={set('leads')} /></Field>
          </Row>
          <ErrorBox error={addStat.error} />
          <Button type="submit" disabled={addStat.isPending}>Natijani saqlash</Button>
        </form>
      )}
      <div className="mt-4">
        <Table head={['Sana', 'Kampaniya', 'Sarf', 'Lid']}>
          {stats.data?.results.map((s) => (
            <tr key={s.id}><td className="num">{date(s.date)}</td><td>{names.get(s.campaign)}</td><td className="num">{s.currency === 'USD' ? '$' : ''}{s.spend}</td><td className="num">{s.leads}</td></tr>
          ))}
        </Table>
      </div>
    </Card>
  )
}
