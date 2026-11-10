import { Download, MoreVertical, Plus, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useInstall } from './pwa'

type Look = 'gold' | 'dark' | 'ghost' | 'sidebar' | 'link'

const LOOKS: Record<Look, string> = {
  gold: 'min-h-[52px] rounded-full bg-gold px-6 text-[15px] font-extrabold text-ink',
  dark: 'min-h-[52px] rounded-full bg-ink px-6 text-[15px] font-extrabold text-ivory',
  ghost: 'min-h-[52px] rounded-full border border-ink/20 bg-white/70 px-5 text-[15px] font-bold text-ink',
  sidebar: 'min-h-10 w-full rounded-xl border border-ink-3 px-3 text-[13px] font-bold text-gold hover:bg-ink-2',
  link: 'min-h-10 text-[13.5px] font-semibold text-bronze',
}

// Ilova o'rnatilgan bo'lsa tugma ko'rinmaydi.
export function InstallApp({ look = 'gold', label = 'Ilovani o‘rnatish', className = '' }: { look?: Look; label?: string; className?: string }) {
  const { mode, prompt } = useInstall()
  const [guide, setGuide] = useState(false)
  if (mode === 'installed') return null
  const onClick = async () => {
    if (mode === 'prompt') await prompt()
    else setGuide(true)
  }
  return (
    <>
      <button type="button" onClick={onClick}
        className={`inline-flex items-center justify-center gap-2 transition-transform duration-200 active:scale-[0.97] ${LOOKS[look]} ${className}`}>
        <Download size={look === 'sidebar' || look === 'link' ? 15 : 17} />{label}
      </button>
      {guide && <InstallGuide ios={mode === 'ios'} onClose={() => setGuide(false)} />}
    </>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold font-display text-[12px] font-bold text-ink">{n}</span>
      <span className="pt-0.5 leading-snug">{children}</span>
    </li>
  )
}

function InstallGuide({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const icon = 'inline-grid h-6 w-6 place-items-center rounded-md bg-ivory align-middle text-ink'
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 p-3 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Ilovani o‘rnatish">
      <div className="w-full max-w-[420px] rounded-[26px] bg-white p-6 text-[15px] text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" width="48" height="48" className="rounded-xl" />
            <div><div className="font-display text-[17px] font-bold">OBRO AGENCY</div><div className="text-[13px] text-text-2">{ios ? 'iPhone’ga o‘rnatish' : 'Telefonga o‘rnatish'}</div></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Yopish" className="grid h-10 w-10 place-items-center rounded-full bg-ivory"><X size={18} /></button>
        </div>
        {ios ? (
          <ol className="space-y-3.5">
            <Step n={1}>Saytni <b>Safari</b>’da oching (Chrome’da ham bo‘ladi).</Step>
            <Step n={2}>Pastdagi <span className={icon}><Share size={14} /></span> <b>«Ulashish»</b> tugmasini bosing.</Step>
            <Step n={3}>Ro‘yxatdan <span className={icon}><Plus size={14} /></span> <b>«Bosh ekranga qo‘shish»</b> (На экран «Домой») ni tanlang.</Step>
            <Step n={4}>Yuqoridagi <b>«Qo‘shish»</b> ni bosing. Belgi bosh ekranda paydo bo‘ladi.</Step>
          </ol>
        ) : (
          <ol className="space-y-3.5">
            <Step n={1}>Saytni <b>Chrome</b>’da oching.</Step>
            <Step n={2}>Yuqori o‘ngdagi <span className={icon}><MoreVertical size={14} /></span> menyuni bosing.</Step>
            <Step n={3}><b>«Ilovani o‘rnatish»</b> yoki <b>«Bosh ekranga qo‘shish»</b> ni tanlang.</Step>
            <Step n={4}><b>«O‘rnatish»</b> ni tasdiqlang.</Step>
          </ol>
        )}
        <p className="mt-5 rounded-2xl bg-ivory p-3.5 text-[13px] leading-snug text-text-2">Ilova telefoningizda alohida dastur kabi ochiladi. Kirish va parol o‘sha-o‘sha.</p>
      </div>
    </div>
  )
}
