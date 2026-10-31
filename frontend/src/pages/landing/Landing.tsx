import { ArrowRight, Check, Clapperboard, Copy, Image, LogIn, MapPin, Menu, MessageCircle, Phone, Play, Plus, RotateCcw, Sparkles, Target, UserRound, Video, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { TargetMark } from '../../shared/ui/Logo'
import './landing.css'

// Narx va xizmatlar tijoriy taklifdan. Mijozlar soni yoki sharh kabi tasdiqlanmagan raqam yozilmaydi.
const TELEGRAM = 'https://t.me/im_ibrokhimov'
const INSTAGRAM = 'https://www.instagram.com/obro.agency/'
const MAP = 'https://www.google.com/maps/search/?api=1&query=C-space+coworking+Farg%27ona'
const PHONE = '+998936444039'
const PHONE_TEXT = '+998 93 644 40 39'

const NAV: [string, string][] = [['#tariflar', 'Tariflar'], ['#jarayon', 'Jarayon'], ['#nega', 'Nega biz'], ['#savollar', 'Savollar'], ['#aloqa', 'Aloqa']]

const ABOUT = 'Kontent, dizayn va reklamani bitta tizimda boshqaramiz. Har bir biznes uchun alohida strategiya, oldindan tuzilgan reja va doimiy tahlil.'

type TierName = 'Basic' | 'Standard' | 'Premium'

interface Tier { name: TierName; price: number; post: number; stories: number; reels: number; extras: string[]; bonus: boolean; stage: string; forWhom: string }

const TIERS: Tier[] = [
  { name: 'Basic', price: 800, post: 4, stories: 15, reels: 10, extras: ['Target reklama sozlamalari', '1 oylik kontent-reja'], bonus: false, stage: 'Endi boshlayapman', forWhom: 'Yangi bizneslar, shaxsiy brendlar va ijtimoiy tarmoqlarini tartibga keltirmoqchi bo‘lgan kompaniyalar uchun.' },
  { name: 'Standard', price: 1000, post: 6, stories: 20, reels: 12, extras: ['Profilni optimallashtirish', 'Target reklama sozlamalari', '1 oylik kontent-reja'], bonus: true, stage: 'Rivojlanyapman', forWhom: 'Faoliyatini tizimli yo‘lga qo‘yishni, brend imijini yaxshilashni va sifatli kontent orqali yangi mijozlarni jalb qilishni istagan bizneslar uchun.' },
  { name: 'Premium', price: 1500, post: 10, stories: 20, reels: 15, extras: ['Profil va brend tahlili', 'Target reklama sozlamalari', '1 oylik kontent-reja'], bonus: true, stage: 'Bozorda kuchayaman', forWhom: 'Marketingga jiddiy investitsiya qilayotgan, bozordagi o‘rnini kuchaytirish va tizimli rivojlanishni maqsad qilgan bizneslar uchun.' },
]

const STEPS: [string, string][] = [
  ['G‘oya va strategiya', 'Auditoriya, raqobatchilar va bozorni o‘rganib, kontent strategiyasini tuzamiz.'],
  ['Kontent ishlab chiqarish', 'Video olish, montaj, dizayn va matn. Hammasi brendingizga mos.'],
  ['Reklama va test', 'Turli kreativlarni sinab, eng samarali auditoriyani topamiz.'],
  ['Tahlil va optimallashtirish', 'Ko‘rishlar, murojaatlar, lidlar va xarajatlarni kuzatib, natijani yaxshilaymiz.'],
]

const EXTRAS: { title: string; text: string; icon: ReactNode }[] = [
  { title: 'Video suratga olish', text: 'Lokatsiya va uskunalar bilan', icon: <Video size={20} /> },
  { title: 'Model yoki brend face', text: 'Professional', icon: <UserRound size={20} /> },
  { title: 'Lokatsiya', text: 'Suratga olish uchun mos joy', icon: <MapPin size={20} /> },
  { title: 'Dizayn, animatsiya, 3D', text: 'Qo‘shimcha ishlab chiqarish', icon: <Sparkles size={20} /> },
]

const FAQ: [string, string][] = [
  ['Xizmat qanday asosda beriladi?', 'Oylik paket asosida. Kontent kalendari va materiallarni tasdiqlash tartibi hamkorlik boshida kelishib olinadi.'],
  ['Reklama budjeti narxga kiradimi?', 'Yo‘q. Target reklama budjeti paket narxiga kirmaydi va alohida kelishiladi.'],
  ['Syomka, model va lokatsiya paketga kiradimi?', 'Alohida kelishilmagan bo‘lsa, suratga olish kunlari, model, lokatsiya va qo‘shimcha xarajatlar paket tarkibiga kirmaydi.'],
  ['Savdo sonini kafolatlaysizmi?', 'Muayyan savdo yoki lidlar soni kafolatlanmaydi. Natija biznes sohasi, taklif sifati, auditoriya va reklama budjetiga bog‘liq. Biz buni ochiq aytamiz.'],
  ['Ish qanday ketayotganini qayerdan ko‘raman?', 'Standard va Premium tariflarda CRM kabinet beriladi: bajarilayotgan ishlar va hisobotlarni istalgan vaqtda ko‘rib turasiz.'],
]

function telegramFor(plan: string) {
  return `${TELEGRAM}?text=${encodeURIComponent(`Assalomu alaykum! ${plan} tarifi haqida bilmoqchi edim.`)}`
}

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M21.5 4 2.8 11.2c-.6.2-.6 1 0 1.2l4.7 1.6 1.8 5.6c.2.5.8.6 1.1.3l2.7-2.5 4.8 3.5c.5.3 1.1.1 1.2-.5L22.3 4.8c.1-.6-.4-1-.8-.8Z" />
      <path d="m7.5 14 10-6.5-7 7.8" />
    </svg>
  )
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <div data-reveal className={className} style={{ '--d': `${delay}ms` } as CSSProperties}>{children}</div>
}

function Kicker({ children, light }: { children: ReactNode; light?: boolean }) {
  return <div className={`mono mb-4 text-[11.5px] tracking-[0.16em] uppercase ${light ? 'text-ivory/70' : 'text-text-2'}`}>{children}</div>
}

function Hero({ zoom, onPointer }: { zoom: React.RefObject<HTMLElement | null>; onPointer: (e: React.PointerEvent) => void }) {
  const chips: [string, ReactNode, string][] = [
    ['Reels', <Clapperboard key="r" size={15} />, '0s'],
    ['Target', <Target key="t" size={15} />, '-9s'],
    ['Post', <Image key="p" size={15} />, '-18s'],
    ['Stories', <Play key="s" size={15} />, '-27s'],
  ]
  return (
    <section ref={zoom} id="bosh" className="zoom" onPointerMove={onPointer}>
      <div className="zoom-stage bg-gold text-ink">
        <div className="zoom-rings" aria-hidden>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 400" fill="none">
            <circle cx="200" cy="200" r="198" stroke="#121210" strokeOpacity="0.22" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="140" stroke="#121210" strokeOpacity="0.4" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="84" stroke="#121210" strokeOpacity="0.7" strokeWidth="1.5" />
          </svg>
          {chips.map(([label, icon, start]) => (
            <div key={label} className="orbit" style={{ '--start': start } as CSSProperties}>
              <div className="orbit-chip flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[12.5px] font-extrabold whitespace-nowrap shadow-[0_10px_24px_-10px_rgb(18_18_16/0.45)] sm:px-4 sm:py-2.5 sm:text-[14px]" style={{ '--start': start } as CSSProperties}>
                {icon}{label}
              </div>
            </div>
          ))}
        </div>
        <div className="zoom-dot" aria-hidden />

        <div className="zoom-copy relative z-10 mx-auto flex h-full max-w-[1240px] flex-col px-5 pt-[92px] sm:px-8 sm:pt-[112px] lg:justify-center lg:pt-16">
          <div className="max-w-[640px]">
            <div className="hero-in mono mb-4 text-[11px] tracking-[0.16em] uppercase sm:text-[12px]">SMM agentlik · Farg‘ona</div>
            <h1 className="hero-in display text-[clamp(46px,13.2vw,104px)]" style={{ '--d': '70ms' } as CSSProperties}>
              Mijozingiz<br /><span className="serif text-[1.14em]">nishonda.</span>
            </h1>
            <p className="hero-in mt-4 max-w-[500px] text-[16.5px] leading-[1.45] font-semibold sm:mt-6 sm:text-[19px]" style={{ '--d': '150ms' } as CSSProperties}>
              Kontent, reklama va tahlilni bitta tizimga solamiz, biznesingiz kerakli odamlarga ko‘rinadi.
            </p>
            <div className="hero-in mt-5 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3" style={{ '--d': '230ms' } as CSSProperties}>
              <a href="#tariflar" className="group inline-flex min-h-[52px] items-center gap-2.5 rounded-full bg-ink px-6 text-[15px] font-extrabold text-ivory transition-transform duration-200 active:scale-[0.97] sm:min-h-14 sm:px-7">
                Tarifni tanlash<ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-1" />
              </a>
              <a href={TELEGRAM} target="_blank" rel="noreferrer" className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full bg-white px-5 text-[15px] font-extrabold transition-transform duration-200 active:scale-[0.97] sm:min-h-14 sm:px-6">
                <TelegramIcon size={18} />Telegram
              </a>
            </div>
          </div>
        </div>

        <div className="zoom-dark z-20 flex items-center text-ivory">
          <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <h2 className="display text-[clamp(38px,10.6vw,112px)]">
              Biz shunchaki kontent <span className="serif text-[1.1em] text-gold">joylashtirmaymiz.</span>
            </h2>
            <p className="mt-6 max-w-[600px] text-[17px] leading-relaxed text-ivory/80 sm:text-[20px]">
              Brend imiji, auditoriya bilan aloqa va marketing birga ishlaydigan tizim quramiz.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Ribbons() {
  const words = ['Marketing', 'Content', 'Target', 'Growth']
  const row = (back?: boolean) => (
    <div className={`marquee ${back ? 'back' : ''}`}>
      {[0, 1].map((group) => (
        <div key={group} className="flex shrink-0 items-center">
          {[...words, ...words].map((word, i) => (
            <span key={i} className="flex items-center gap-5 pr-5 font-display text-[20px] font-bold tracking-[-0.01em] sm:gap-7 sm:pr-7 sm:text-[26px]">{word}<TargetMark size={20} color={back ? '#FFC21F' : '#121210'} /></span>
          ))}
        </div>
      ))}
    </div>
  )
  return (
    <div className="relative my-4 overflow-hidden py-10 sm:py-12" aria-hidden>
      <div className="absolute inset-x-[-5%] top-1/2 -translate-y-1/2 rotate-[-3deg] bg-gold py-3 text-ink">{row()}</div>
      <div className="relative mx-[-5%] rotate-[2deg] bg-ink py-3 text-ivory">{row(true)}</div>
    </div>
  )
}

function spread(count: number, offset: number) {
  return new Set(Array.from({ length: count }, (_, i) => Math.floor(((i + offset) * 30) / count) % 30))
}

function MonthPlanner() {
  const [name, setName] = useState<TierName>('Standard')
  const tier = TIERS.find((t) => t.name === name) ?? TIERS[1]
  const days = useMemo(() => {
    const reels = spread(tier.reels, 0.3)
    const posts = spread(tier.post, 0.6)
    const stories = spread(tier.stories, 0.1)
    return Array.from({ length: 30 }, (_, day) => ({ day: day + 1, reel: reels.has(day), post: posts.has(day), story: stories.has(day) }))
  }, [tier])
  const total = tier.post + tier.stories + tier.reels
  return (
    <section id="tariflar" className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-28">
      <Reveal>
        <Kicker>Smart Start · Oylik paketlar</Kicker>
        <h2 className="display text-[clamp(32px,8.6vw,64px)]">Bir oyingiz <span className="mark">qanday ko‘rinadi?</span></h2>
        <p className="mt-4 max-w-[560px] text-[16.5px] leading-relaxed text-text-2">Biznesingiz qaysi bosqichda? Tanlang, oylik reja o‘sha zahoti o‘zgaradi.</p>
      </Reveal>

      <Reveal className="mt-7">
        <div role="tablist" aria-label="Tarif tanlash" className="grid grid-cols-3 gap-2 sm:gap-3">
          {TIERS.map((t) => {
            const on = t.name === name
            return (
              <button key={t.name} type="button" role="tab" aria-selected={on} onClick={() => setName(t.name)}
                className={`min-h-[92px] rounded-2xl p-3 text-left transition-[background-color,transform] duration-200 active:scale-[0.97] sm:rounded-3xl sm:p-5 ${on ? 'bg-ink text-ivory' : 'bg-white text-ink shadow-card'}`}>
                <span className={`block text-[11.5px] leading-tight font-semibold sm:text-[13.5px] ${on ? 'text-ivory/75' : 'text-text-2'}`}>{t.stage}</span>
                <span className="mt-2 block font-display text-[14px] font-bold sm:text-[20px]">{t.name}</span>
                <span className={`num block text-[13px] font-bold sm:text-[15px] ${on ? 'text-gold' : ''}`}>${t.price}</span>
              </button>
            )
          })}
        </div>
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Reveal>
          <div className="rounded-[26px] bg-white p-4 shadow-card sm:p-7">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><span className="display text-[44px] sm:text-[56px]">{total}</span> <span className="font-bold text-text-2">ta kontent / oy</span></div>
            </div>
            <div className="grid grid-cols-6 gap-1 sm:gap-1.5" key={name}>
              {days.map((d) => (
                <div key={d.day} className="aspect-square min-w-0 rounded-[10px] bg-ivory p-1 sm:rounded-xl sm:p-1.5">
                  <div className="num text-[9.5px] leading-none text-muted sm:text-[11px]">{d.day}</div>
                  <div className="mt-1 flex flex-wrap gap-[3px] sm:mt-1.5 sm:gap-1">
                    {d.reel && <i className="day-mark block h-2.5 w-2.5 rounded-[3px] bg-gold-deep sm:h-3.5 sm:w-3.5" style={{ '--d': `${d.day * 12}ms` } as CSSProperties} />}
                    {d.post && <i className="day-mark block h-2.5 w-2.5 rounded-[3px] bg-ink sm:h-3.5 sm:w-3.5" style={{ '--d': `${d.day * 12}ms` } as CSSProperties} />}
                    {d.story && <i className="day-mark block h-2.5 w-2.5 rounded-full border-2 border-text-2 sm:h-3.5 sm:w-3.5" style={{ '--d': `${d.day * 12}ms` } as CSSProperties} />}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px] font-semibold">
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-[3px] bg-gold-deep" />{tier.reels} Reels</span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-[3px] bg-ink" />{tier.post} post</span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full border-2 border-text-2" />{tier.stories} Stories</span>
            </div>
            <p className="mt-2 text-[12.5px] text-muted">Namuna. Aniq kunlar kontent-rejada birga kelishiladi.</p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="flex h-full flex-col rounded-[26px] bg-gold p-6 text-ink sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-[22px] font-bold">{tier.name}</h3>
              {tier.name === 'Standard' && <span className="rounded-full bg-ink px-3 py-1.5 text-[11.5px] font-bold text-gold">Eng maqbul</span>}
            </div>
            <div className="mt-2"><span className="display text-[clamp(52px,14vw,72px)]">${tier.price}</span> <span className="font-bold">/ oy</span></div>
            <p className="mt-3 text-[14.5px] leading-snug font-medium">{tier.forWhom}</p>
            <ul className="mt-5 space-y-2.5 text-[15px] font-semibold">
              {[`${tier.post} ta post dizayni va matn`, `${tier.stories} ta Stories`, `${tier.reels} ta Reels`, ...tier.extras].map((line) => (
                <li key={line} className="flex items-start gap-2.5"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-gold"><Check size={12} strokeWidth={3.5} /></span>{line}</li>
              ))}
              <li className={`flex items-start gap-2.5 ${tier.bonus ? '' : 'opacity-65'}`}>
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-gold">{tier.bonus ? <Check size={12} strokeWidth={3.5} /> : <X size={12} strokeWidth={3.5} />}</span>
                {tier.bonus ? 'Bonus: studiya va CRM kabinet' : 'Studiya va CRM Standard hamda Premium’da'}
              </li>
            </ul>
            <a href={telegramFor(tier.name)} target="_blank" rel="noreferrer" className="mt-auto inline-flex min-h-[54px] translate-y-0 items-center justify-center gap-2.5 rounded-full bg-ink px-6 text-[15.5px] font-extrabold text-ivory transition-transform duration-200 active:scale-[0.97] max-lg:mt-6 lg:mt-6">
              {tier.name} tarifini tanlash<ArrowRight size={18} />
            </a>
          </div>
        </Reveal>
      </div>
      <Reveal><p className="mt-4 text-[13.5px] text-text-2">* Target reklama uchun reklama budjeti paket narxiga kirmaydi va alohida kelishiladi.</p></Reveal>
    </section>
  )
}

function Process() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step))
      }
    }, { rootMargin: '-45% 0px -45% 0px' })
    refs.current.forEach((node) => node && observer.observe(node))
    return () => observer.disconnect()
  }, [])
  const pills: [string, boolean][] = [['Kontent', active >= 1], ['Reklama', active >= 2], ['Tahlil', active >= 3]]
  return (
    <section id="jarayon" className="bg-ivory py-16 lg:py-28">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Kicker>Ish jarayoni</Kicker>
          <h2 className="display text-[clamp(32px,8.6vw,64px)]">Natija <span className="serif text-[1.14em]">tasodif</span> emas, <span className="mark">formula.</span></h2>
          <div className="mt-6 flex flex-wrap items-center gap-1.5 font-display text-[12.5px] font-semibold sm:gap-2 sm:text-[15px]">
            {pills.map(([word, on], i) => (
              <span key={word} className="flex items-center gap-1.5 sm:gap-2">
                {i > 0 && <span className="text-muted">+</span>}
                <span className={`rounded-full px-3 py-2 transition-colors duration-300 sm:px-4 sm:py-2.5 ${on ? 'bg-ink text-ivory' : 'bg-white'}`}>{word}</span>
              </span>
            ))}
            <span className="text-muted">=</span>
            <span className={`rounded-full px-3 py-2 transition-colors duration-300 sm:px-4 sm:py-2.5 ${active >= 3 ? 'bg-gold' : 'bg-white'}`}>Natija</span>
          </div>
        </div>
        <ol className="relative">
          <span className="absolute top-3 bottom-3 left-[19px] w-0.5 bg-line" aria-hidden />
          <span className="absolute top-3 left-[19px] w-0.5 bg-ink transition-[height] duration-500" style={{ height: `${(active / (STEPS.length - 1)) * 86}%` }} aria-hidden />
          {STEPS.map(([title, text], i) => (
            <li key={title} className="pb-12 last:pb-0 lg:pb-24">
              <div ref={(node) => { refs.current[i] = node }} data-step={i} className="relative flex gap-5">
                <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold transition-colors duration-300 ${i <= active ? 'bg-gold text-ink' : 'bg-white text-muted'}`}>{i + 1}</span>
                <div className={`pt-1 transition-opacity duration-300 ${i <= active ? '' : 'opacity-45'}`}>
                  <h3 className="font-display text-[19px] leading-snug font-semibold sm:text-[23px]">{title}</h3>
                  <p className="mt-2 max-w-[440px] text-[15.5px] leading-relaxed text-text-2">{text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CrmDemo({ cabinet }: { cabinet: string }) {
  const start = [{ title: 'Reels: bahor aksiyasi', ok: false }, { title: 'Post: yangi xizmat', ok: false }, { title: 'Stories: kun taklifi', ok: true }]
  const [items, setItems] = useState(start)
  const left = items.filter((i) => !i.ok).length
  return (
    <div className="rounded-[26px] bg-ink p-5 text-ivory sm:p-7">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-display text-[20px] leading-snug font-bold sm:text-[24px]">CRM orqali nazorat</h3>
        <button type="button" onClick={() => setItems(start)} aria-label="Namunani qaytadan boshlash" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10"><RotateCcw size={16} /></button>
      </div>
      <p className="mb-4 text-[14.5px] leading-snug text-ivory/75">Barcha ish va hisobotlarni istalgan vaqtda ko‘rib turasiz. Sinab ko‘ring, bu kabinetning namunasi:</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.title} className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.08] py-2 pr-2 pl-4 text-[14px]">
            <span className="min-w-0 font-semibold">{item.title}</span>
            {item.ok
              ? <span className="flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-[13px] font-bold text-gold"><Check size={15} strokeWidth={3} />Tasdiqlandi</span>
              : <button type="button" onClick={() => setItems(items.map((row, n) => (n === i ? { ...row, ok: true } : row)))} className="min-h-11 shrink-0 rounded-xl bg-gold px-3.5 text-[13px] font-extrabold text-ink transition-transform active:scale-95">Tasdiqlash</button>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px]">
        <span className="font-semibold text-ivory/80" aria-live="polite">{left ? `${left} ta material tasdiq kutmoqda` : 'Hammasi tasdiqlandi, jamoaga xabar ketdi'}</span>
        <Link to={cabinet} className="flex min-h-11 items-center gap-1.5 font-extrabold text-gold">Kabinetga kirish<ArrowRight size={16} /></Link>
      </div>
    </div>
  )
}

function Why({ cabinet }: { cabinet: string }) {
  return (
    <section id="nega" className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-28">
      <Reveal>
        <Kicker>Afzalliklar</Kicker>
        <h2 className="display max-w-[800px] text-[clamp(32px,8.6vw,64px)]">Nega <span className="mark">OBRO?</span> Chunki bu faqat kontent emas, <span className="serif text-[1.14em]">hamkorlik.</span></h2>
      </Reveal>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Reveal className="sm:col-span-2 lg:row-span-2"><CrmDemo cabinet={cabinet} /></Reveal>
        <Reveal delay={60}>
          <div className="lift h-full rounded-[26px] bg-gold p-6">
            <Target size={26} />
            <h3 className="mt-8 font-display text-[17px] leading-snug font-bold">Strategik yondashuv</h3>
            <p className="mt-1.5 text-[14.5px] leading-snug font-medium">Har bir kontent maqsadli va natijaga yo‘naltirilgan.</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="lift h-full rounded-[26px] bg-white p-6 shadow-card">
            <UserRound size={26} />
            <h3 className="mt-8 font-display text-[17px] leading-snug font-bold">Professional jamoa</h3>
            <p className="mt-1.5 text-[14.5px] leading-snug text-text-2">Tajriba, ijod va marketing bilimlari birga.</p>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <div className="lift h-full rounded-[26px] bg-white p-6 shadow-card">
            <Sparkles size={26} />
            <h3 className="mt-8 font-display text-[17px] leading-snug font-bold">Zamonaviy uslub</h3>
            <p className="mt-1.5 text-[14.5px] leading-snug text-text-2">Trendlarga va brendingizga mos kontent.</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="lift h-full rounded-[26px] bg-gold-soft p-6">
            <MessageCircle size={26} />
            <h3 className="mt-8 font-display text-[17px] leading-snug font-bold">Doimiy aloqa</h3>
            <p className="mt-1.5 text-[14.5px] leading-snug text-text-2">Murojaat, lid va savdoni kuzatib, ochiq gaplashamiz.</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="savollar" className="bg-ivory py-16 lg:py-28">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <div>
          <Reveal>
            <Kicker>Alohida kelishuv asosida</Kicker>
            <h2 className="display text-[clamp(30px,7.6vw,52px)]">Yana kerak <span className="mark">bo‘lsa</span></h2>
          </Reveal>
          <div className="mt-6">
            {EXTRAS.map((item) => (
              <Reveal key={item.title}>
                <div className="extra-row flex items-center gap-4 rounded-2xl py-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white">{item.icon}</span>
                  <span><b className="block font-display text-[15.5px] font-semibold">{item.title}</b><span className="text-[14px] text-text-2">{item.text}</span></span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <div>
          <Reveal>
            <Kicker>Shartlar</Kicker>
            <h2 className="display text-[clamp(30px,7.6vw,52px)]">Ochiq <span className="serif text-[1.14em]">gaplashamiz</span></h2>
          </Reveal>
          <div className="mt-6 space-y-2">
            {FAQ.map(([q, a]) => (
              <Reveal key={q}>
                <details className="group rounded-2xl bg-white px-5">
                  <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15.5px] font-bold">
                    {q}<Plus size={19} className="faq-plus shrink-0" />
                  </summary>
                  <p className="pb-4 text-[14.5px] leading-relaxed text-text-2">{a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Contact() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PHONE)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section id="aloqa" className="relative isolate overflow-hidden bg-gold py-16 text-ink lg:py-28">
      <TargetMark size={520} color="#121210" className="pointer-events-none absolute -right-48 -bottom-48 -z-10 opacity-10" />
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Reveal>
          <Kicker>Aloqa</Kicker>
          <h2 className="display max-w-[860px] text-[clamp(36px,9.6vw,84px)]">Keling, brendingizni <span className="serif text-[1.12em]">birgalikda</span> rivojlantiramiz!</h2>
        </Reveal>
        <Reveal className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`tel:${PHONE}`} className="num font-display text-[clamp(27px,8.2vw,64px)] leading-tight font-bold tracking-[-0.03em] whitespace-nowrap underline-offset-4 hover:underline">{PHONE_TEXT}</a>
            <button type="button" onClick={copy} aria-label="Raqamni nusxalash" className="grid h-11 w-11 place-items-center rounded-full bg-ink/10">{copied ? <Check size={17} /> : <Copy size={17} />}</button>
          </div>
        </Reveal>
        <Reveal className="mt-6">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <a href={TELEGRAM} target="_blank" rel="noreferrer" className="flex min-h-[68px] items-center gap-3.5 rounded-2xl bg-ink p-4 text-ivory"><TelegramIcon /><span><b className="block text-[15px]">@im_ibrokhimov</b><span className="text-[12.5px] text-ivory/70">Telegram</span></span></a>
            <a href={INSTAGRAM} target="_blank" rel="noreferrer" className="flex min-h-[68px] items-center gap-3.5 rounded-2xl bg-white p-4"><InstagramIcon /><span><b className="block text-[15px]">@obro.agency</b><span className="text-[12.5px] text-text-2">Instagram</span></span></a>
            <a href={MAP} target="_blank" rel="noreferrer" className="flex min-h-[68px] items-center gap-3.5 rounded-2xl bg-white p-4"><MapPin size={20} /><span><b className="block text-[15px]">C-space coworking</b><span className="text-[12.5px] text-text-2">Farg‘ona</span></span></a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function LandingPage() {
  const { user } = useAuth()
  const [menu, setMenu] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const zoom = useRef<HTMLElement>(null)
  const burn = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.title
    const theme = document.querySelector('meta[name="theme-color"]')
    const previousTheme = theme?.getAttribute('content')
    document.title = 'OBRO AGENCY — SMM agentlik | Marketing, kontent, target'
    theme?.setAttribute('content', '#FFC21F')
    document.documentElement.classList.add('landing-open')
    return () => {
      document.title = previous
      if (previousTheme) theme?.setAttribute('content', previousTheme)
      document.documentElement.classList.remove('landing-open')
    }
  }, [])

  useEffect(() => {
    const nodes = root.current?.querySelectorAll('[data-reveal]') ?? []
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  // Scroll harakatlari React'ni qayta chizmaydi: faqat CSS o'zgaruvchilari yangilanadi.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      const box = zoom.current
      if (box) {
        const rect = box.getBoundingClientRect()
        const p = Math.min(Math.max(-rect.top / Math.max(rect.height - window.innerHeight, 1), 0), 1)
        const grow = Math.min(Math.max((p - 0.12) / 0.6, 0), 1)
        const dot = box.querySelector('.zoom-dot')?.clientWidth ?? 100
        box.style.setProperty('--p', p.toFixed(4))
        box.style.setProperty('--e', (grow * grow).toFixed(4))
        box.style.setProperty('--dot', String(Math.ceil((Math.hypot(window.innerWidth, window.innerHeight) * 2.2) / dot)))
      }
      const text = burn.current
      if (text) {
        const rect = text.getBoundingClientRect()
        const span = window.innerHeight * 0.62 + rect.height * 0.4
        text.style.setProperty('--sp', Math.min(Math.max((window.innerHeight * 0.85 - rect.top) / span, 0), 1).toFixed(4))
      }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  function onPointer(e: React.PointerEvent) {
    const box = zoom.current
    if (!box || e.pointerType !== 'mouse') return
    box.style.setProperty('--tx', String(e.clientX / window.innerWidth - 0.5))
    box.style.setProperty('--ty', String(e.clientY / window.innerHeight - 0.5))
  }

  const cabinet = user ? (user.is_client ? '/portal' : '/app') : '/login'
  const words = ABOUT.split(' ')

  return (
    <div ref={root} className="landing min-h-screen bg-paper pb-[76px] text-ink lg:pb-0">
      <header className="fixed inset-x-2.5 top-2.5 z-40 mx-auto max-w-[1240px] rounded-[22px] bg-white/90 shadow-[0_10px_30px_-14px_rgb(18_18_16/0.35)] backdrop-blur-xl sm:inset-x-5 sm:top-4">
        <div className="flex h-[60px] items-center justify-between gap-2 pr-2 pl-3.5 sm:pl-5">
          <a href="#bosh" aria-label="OBRO AGENCY, bosh sahifa" onClick={() => setMenu(false)} className="flex min-h-11 items-center gap-2 font-display text-[12.5px] font-bold whitespace-nowrap sm:text-[14px]">
            <TargetMark size={24} color="#121210" />OBRO AGENCY
          </a>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Asosiy menyu">
            {NAV.map(([href, label]) => <a key={href} href={href} className="text-[14px] font-bold text-text-2 transition-colors hover:text-ink">{label}</a>)}
          </nav>
          <div className="flex items-center gap-1.5">
            <a href={`tel:${PHONE}`} className="num hidden min-h-11 items-center px-3 text-[14px] font-bold xl:flex">{PHONE_TEXT}</a>
            <Link to={cabinet} className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-ink px-3.5 text-[13.5px] font-extrabold text-ivory transition-transform active:scale-[0.97] sm:px-5">
              <LogIn size={15} />{user ? 'Kabinet' : 'Login'}
            </Link>
            <button type="button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Menyuni yopish' : 'Menyuni ochish'} aria-expanded={menu} className="grid h-11 w-11 place-items-center rounded-[14px] bg-ivory lg:hidden">
              {menu ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="border-t border-line-soft px-4 py-1.5 lg:hidden" aria-label="Mobil menyu">
            {NAV.map(([href, label]) => <a key={href} href={href} onClick={() => setMenu(false)} className="flex min-h-12 items-center justify-between text-[16px] font-bold">{label}<ArrowRight size={16} /></a>)}
          </nav>
        )}
      </header>

      <main>
        <Hero zoom={zoom} onPointer={onPointer} />

        <section className="mx-auto max-w-[1240px] px-5 pt-20 pb-8 sm:px-8 lg:pt-32">
          <Kicker>Biz haqimizda</Kicker>
          <div ref={burn} className="burn display text-[clamp(27px,7.2vw,58px)] leading-[1.14]" style={{ '--n': words.length } as CSSProperties}>
            {words.map((word, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{word} </span>)}
          </div>
        </section>

        <Ribbons />
        <MonthPlanner />
        <Process />
        <Why cabinet={cabinet} />
        <Faq />
        <Contact />
      </main>

      <footer className="bg-ink text-ivory/70">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-2 px-5 py-7 text-[13.5px] sm:px-8">
          <span className="flex items-center gap-2 font-display text-[13px] font-bold text-ivory"><TargetMark size={22} />OBRO AGENCY</span>
          <span>© {new Date().getFullYear()} OBRO AGENCY</span>
          <Link to="/jamoa" className="flex min-h-11 items-center hover:text-ivory">Jamoa uchun</Link>
        </div>
      </footer>

      {/* Telefonda doim ko'rinadigan aloqa paneli */}
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-line-soft bg-white/95 p-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <a href={`tel:${PHONE}`} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-gold text-[15px] font-extrabold active:scale-[0.98]"><Phone size={17} />Qo‘ng‘iroq</a>
        <a href={TELEGRAM} target="_blank" rel="noreferrer" className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-ink text-[15px] font-extrabold text-ivory active:scale-[0.98]"><TelegramIcon size={18} />Telegram</a>
      </div>
      <a href={TELEGRAM} target="_blank" rel="noreferrer" aria-label="Telegram’da yozish" className="fixed right-6 bottom-6 z-30 hidden h-14 w-14 place-items-center rounded-full bg-ink text-gold shadow-[0_14px_32px_-10px_rgb(18_18_16/0.6)] transition-transform duration-200 hover:scale-105 lg:grid">
        <TelegramIcon size={22} />
      </a>
    </div>
  )
}
