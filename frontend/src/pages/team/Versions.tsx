import { useEffect } from 'react'
import { date } from '../../shared/lib/format'
import { markReleaseSeen, RELEASES } from '../../shared/changelog'
import { Badge, Card, Kicker, PageHeader } from '../../shared/ui'

export function VersionsPage() {
  useEffect(() => { markReleaseSeen() }, [])
  return (
    <>
      <PageHeader title="Versiyalar" subtitle="Har yangilanishda nima o‘zgargani" />
      <ol className="relative max-w-[820px] space-y-4">
        {RELEASES.map((release, index) => (
          <li key={release.version}>
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-ink px-2.5 py-1 font-display text-[12px] font-bold text-gold">v{release.version}</span>
                <span className="num text-[13px] text-muted">{date(release.date)}</span>
                {index === 0 && <Badge tone="ok" dot>Hozirgi</Badge>}
              </div>
              <h2 className="mb-3 font-display text-[18px] leading-snug font-semibold">{release.title}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {release.changes.map((group) => (
                  <div key={group.area}>
                    <Kicker>{group.area}</Kicker>
                    <ul className="space-y-1.5 text-[14px] leading-snug">
                      {group.items.map((item) => <li key={item} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-deep" />{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </>
  )
}
