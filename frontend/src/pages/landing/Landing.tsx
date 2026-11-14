import { ArrowRight, BarChart3, CalendarCheck, Check, ChevronDown, Clapperboard, Copy, Image, LogIn, MapPin, Menu, Phone, Play, Plus, RotateCcw, Sparkles, Target, UserRound, Video, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { InstallApp } from '../../shared/InstallApp'
import { TargetMark } from '../../shared/ui/Logo'
import './landing.css'

// Mijozga havola qilib yuboriladigan sahifa: telefonda oddiy, uzun, pastga suriladigan sahifa (slayd emas).
// Narx va xizmatlar tijoriy taklifdan. Mijozlar soni yoki sharh kabi tasdiqlanmagan raqam yozilmaydi.
const TELEGRAM = 'https://t.me/im_ibrokhimov'
const INSTAGRAM = 'https://www.instagram.com/obroagency/'
const MAP = 'https://www.google.com/maps/search/?api=1&query=C-space+coworking+Farg%27ona'
const PHONE = '+998936444039'
const PHONE_TEXT = '+998 93 644 40 39'

const NAV: [string, string][] = [['#tariflar', 'Tariflar'], ['#xizmatlar', 'Nima qilamiz'], ['#kabinet', 'Kabinet'], ['#savollar', 'Savollar'], ['#aloqa', 'Aloqa']]

type TierName = 'Mini' | 'Lite' | 'Basic' | 'Standard' | 'Premium'

interface Tier { name: TierName; price: number; post: number; stories: number; reels: number; extras: string[]; studio: boolean; stage: string; forWhom: string }

const TARGET = 'Target reklama sozlamalari'
const PLAN = '1 oylik kontent-reja'

const TIERS: Tier[] = [
  { name: 'Mini', price: 300, post: 4, stories: 8, reels: 8, extras: [PLAN], studio: false, stage: 'Ilk qadam', forWhom: 'Ijtimoiy tarmoqlarda ilk qadamni qo‘yayotgan kichik bizneslar va yakka tadbirkorlar uchun.' },
  { name: 'Lite', price: 500, post: 6, stories: 10, reels: 10, extras: [TARGET, PLAN], studio: false, stage: 'Sinab ko‘raman', forWhom: 'Sahifasini muntazam yuritishni va reklamani sinab ko‘rishni boshlamoqchi bo‘lgan kichik bizneslar uchun.' },
  { name: 'Basic', price: 800, post: 8, stories: 15, reels: 12, extras: [TARGET, PLAN], studio: false, stage: 'Tartibga solaman', forWhom: 'Yangi bizneslar, shaxsiy brendlar va ijtimoiy tarmoqlarini tartibga keltirmoqchi bo‘lgan kompaniyalar uchun.' },
  { name: 'Standard', price: 1000, post: 10, stories: 20, reels: 14, extras: ['Profilni optimallashtirish', TARGET, PLAN], studio: true, stage: 'Rivojlanyapman', forWhom: 'Faoliyatini tizimli yo‘lga qo‘yishni, brend imijini yaxshilashni va sifatli kontent orqali yangi mijozlarni jalb qilishni istagan bizneslar uchun.' },
  { name: 'Premium', price: 1500, post: 12, stories: 20, reels: 16, extras: ['Profil va brend tahlili', TARGET, PLAN], studio: true, stage: 'Bozorda kuchayaman', forWhom: 'Marketingga jiddiy investitsiya qilayotgan, bozordagi o‘rnini kuchaytirish va tizimli rivojlanishni maqsad qilgan bizneslar uchun.' },
]

const STEPS: [string, string, ReactNode][] = [
  ['G‘oya va strategiya', 'Auditoriya, raqobatchilar va bozorni o‘rganib, kontent strategiyasini tuzamiz.', <Target key="1" size={22} />],
  ['Kontent ishlab chiqarish', 'Video olish, montaj, dizayn va matn. Hammasi brendingizga mos.', <Clapperboard key="2" size={22} />],
  ['Reklama va test', 'Turli kreativlarni sinab, eng samarali auditoriyani topamiz.', <Sparkles key="3" size={22} />],
  ['Tahlil va optimallashtirish', 'Ko‘rishlar, murojaatlar, lidlar va xarajatlarni kuzatib, natijani yaxshilaymiz.', <BarChart3 key="4" size={22} />],
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
  ['Ish qanday ketayotganini qayerdan ko‘raman?', 'Barcha tariflarda CRM kabinet beriladi: bajarilayotgan ishlar, tasdiqlash va hisobotlarni istalgan vaqtda ko‘rib turasiz.'],
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

function Kicker({ children }: { children: ReactNode }) {
  return <div className="mono mb-3 text-[11.5px] tracking-[0.16em] text-text-2 uppercase">{children}</div>
}

function SectionTitle({ kicker, children, sub }: { kicker: string; children: ReactNode; sub?: string }) {
  return (
    <div className="mb-7 max-w-[680px]">
      <Kicker>{kicker}</Kicker>
      <h2 className="display text-[clamp(30px,8vw,56px)]">{children}</h2>
      {sub && <p className="mt-3 text-[16px] leading-relaxed text-text-2">{sub}</p>}
    </div>
  )
}

function Hero() {
  const standard = TIERS[3]
  return (
    <section id="bosh" className="relative isolate overflow-hidden bg-gold text-ink">
      <TargetMark size={460} color="#121210" className="pointer-events-none absolute -top-24 -right-40 -z-10 opacity-[0.07] sm:-right-24" />
      <div className="mx-auto grid max-w-[1240px] items-center gap-8 px-5 pt-[calc(env(safe-area-inset-top)+84px)] pb-4 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-[calc(env(safe-area-inset-top)+132px)] lg:pb-16">
        <div>
          <div className="mono mb-3 text-[11px] tracking-[0.16em] uppercase sm:text-[12px]">SMM agentlik · Farg‘ona</div>
          <h1 className="display text-[clamp(38px,11vw,96px)]">Mijozingiz<br /><span className="serif text-[1.14em]">nishonda.</span></h1>
          <p className="mt-3 max-w-[520px] text-[16.5px] leading-[1.42] font-semibold sm:text-[19px]">
            Kontent, reklama va tahlil — bitta tizimda. Hammasini telefoningizdagi kabinetda ko‘rib turasiz.
          </p>
          <ul className="mt-4 grid max-w-[520px] grid-cols-3 gap-2 text-center">
            {[['5 ta', 'tarif'], ['$300', 'dan, oyiga'], ['CRM', 'kabinet har tarifda']].map(([big, small]) => (
              <li key={big} className="rounded-2xl bg-white/70 px-2 py-2.5">
                <b className="block font-display text-[19px] leading-none sm:text-[22px]">{big}</b>
                <span className="mt-1 block text-[12px] leading-tight font-semibold text-text-2">{small}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <a href="#tariflar" className="inline-flex min-h-[54px] items-center gap-2.5 rounded-full bg-ink px-6 text-[15.5px] font-extrabold text-ivory active:scale-[0.97]">
              Tarif va narxlar<ArrowRight size={18} />
            </a>
            <a href={TELEGRAM} target="_blank" rel="noreferrer" className="inline-flex min-h-[54px] items-center gap-2.5 rounded-full bg-white px-5 text-[15.5px] font-extrabold active:scale-[0.97]">
              <TelegramIcon size={18} />Yozish
            </a>
          </div>
        </div>

        {/* Bir oy qanday ko'rinishi: aniq raqamlar bilan kichik kartochka */}
        <div className="hidden rounded-[28px] bg-white p-6 shadow-[0_24px_60px_-28px_rgb(18_18_16/0.45)] lg:block">
          <div className="flex items-center justify-between">
            <span className="font-display text-[15px] font-bold">Standard · 1 oy</span>
            <span className="rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-gold">${standard.price}</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {([['Reels', standard.reels, <Clapperboard key="r" size={18} />], ['Post', standard.post, <Image key="p" size={18} />], ['Stories', standard.stories, <Play key="s" size={18} />]] as [string, number, ReactNode][]).map(([label, n, icon]) => (
              <div key={label} className="rounded-2xl bg-ivory p-3">
                <span className="text-text-2">{icon}</span>
                <b className="mt-2 block font-display text-[30px] leading-none">{n}</b>
                <span className="text-[13px] font-semibold text-text-2">{label}</span>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-[14px] font-semibold">
            {['Target reklama sozlamalari', 'Profilni optimallashtirish', 'Kabinetda tasdiqlash va hisobot'].map((line) => (
              <li key={line} className="flex items-center gap-2"><Check size={16} className="text-ok" />{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <a href="#tariflar" className="scroll-cue mx-auto flex min-h-11 w-max items-center gap-1 pb-3 text-[13px] font-bold text-ink/75 lg:pb-8" aria-label="Pastga surib tariflarni ko‘rish">
        Pastga suring<ChevronDown size={20} />
      </a>
    </section>
  )
}

function TierCard({ tier }: { tier: Tier }) {
  const best = tier.name === 'Standard'
  return (
    <article className={`flex flex-col rounded-[26px] p-5 sm:p-6 ${best ? 'bg-ink text-ivory ring-4 ring-gold' : 'bg-white shadow-card'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`block text-[12.5px] font-semibold ${best ? 'text-ivory/70' : 'text-text-2'}`}>{tier.stage}</span>
          <h3 className="font-display text-[22px] font-bold">{tier.name}</h3>
        </div>
        {best && <span className="rounded-full bg-gold px-3 py-1.5 text-[11.5px] font-extrabold text-ink">Tavsiya etamiz</span>}
      </div>
      <div className="mt-2">
        <span className="display text-[44px]">${tier.price}</span>
        <span className={`font-bold ${best ? 'text-ivory/70' : 'text-text-2'}`}> / oy</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {([['Reels', tier.reels], ['Post', tier.post], ['Stories', tier.stories]] as [string, number][]).map(([label, n]) => (
          <div key={label} className={`rounded-xl py-2 ${best ? 'bg-white/10' : 'bg-ivory'}`}>
            <b className="block font-display text-[20px] leading-none">{n}</b>
            <span className={`text-[12px] font-semibold ${best ? 'text-ivory/70' : 'text-text-2'}`}>{label}</span>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-[14.5px] font-semibold">
        {[...tier.extras, 'CRM kabinet'].map((line) => (
          <li key={line} className="flex items-start gap-2"><Check size={16} className={`mt-0.5 shrink-0 ${best ? 'text-gold' : 'text-ok'}`} />{line}</li>
        ))}
        {tier.studio && <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-gold" />Bonus: studiya</li>}
        {tier.name === 'Mini' && <li className="flex items-start gap-2 text-text-2"><X size={16} className="mt-0.5 shrink-0" />Target reklama sozlash kirmaydi</li>}
      </ul>
      <p className={`mt-3 text-[13px] leading-snug ${best ? 'text-ivory/70' : 'text-text-2'}`}>{tier.forWhom}</p>
      <a href={telegramFor(tier.name)} target="_blank" rel="noreferrer"
        className={`mt-5 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-5 text-[15px] font-extrabold active:scale-[0.97] ${best ? 'bg-gold text-ink' : 'bg-ink text-ivory'}`}>
        {tier.name} tarifini tanlash<ArrowRight size={17} />
      </a>
    </article>
  )
}

function Tariffs() {
  // Telefonda tavsiya etilgan tarif birinchi ko'rinadi, keyin qolganlari kattasidan kichigiga.
  const order: TierName[] = ['Standard', 'Premium', 'Basic', 'Lite', 'Mini']
  const mobile = order.map((name) => TIERS.find((t) => t.name === name)!)
  return (
    <section id="tariflar" className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:py-24">
      <SectionTitle kicker="Oylik paketlar" sub="Hamma tarifda oylik kontent-reja va CRM kabinet bor. Narx — oyiga.">
        Tariflar va <span className="mark">narxlar</span>
      </SectionTitle>
      <div className="grid gap-4 lg:hidden">{mobile.map((t) => <TierCard key={t.name} tier={t} />)}</div>
      <div className="hidden gap-3 lg:grid lg:grid-cols-5">{TIERS.map((t) => <TierCard key={t.name} tier={t} />)}</div>
      <p className="mt-5 rounded-2xl bg-gold-soft p-4 text-[14px] leading-relaxed font-semibold">
        Reklama budjeti, alohida suratga olish kunlari, model va lokatsiya paket narxiga kirmaydi — alohida kelishiladi.
      </p>
    </section>
  )
}

function Services() {
  return (
    <section id="xizmatlar" className="bg-ivory py-14 lg:py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionTitle kicker="Nima qilamiz" sub="Kontent, dizayn va reklamani bitta tizimda boshqaramiz. Har bir biznes uchun alohida strategiya, oldindan tuzilgan reja va doimiy tahlil.">
          4 qadamda <span className="serif text-[1.12em]">natijaga</span>
        </SectionTitle>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text, icon], i) => (
            <li key={title} className="rounded-[24px] bg-white p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gold">{icon}</span>
                <span className="font-display text-[13px] font-bold text-muted">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-[18px] leading-snug font-bold">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-text-2">{text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-[15px] leading-relaxed font-semibold">
          Jamoa: SMM menejer (SMM va target), videograf-mobilograf va dizayner-montajyor.
        </p>
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
        <h3 className="font-display text-[19px] leading-snug font-bold sm:text-[22px]">Sinab ko‘ring: kabinet namunasi</h3>
        <button type="button" onClick={() => setItems(start)} aria-label="Namunani qaytadan boshlash" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10"><RotateCcw size={16} /></button>
      </div>
      <p className="mb-4 text-[14.5px] leading-snug text-ivory/75">«Tasdiqlash» tugmasini bosib ko‘ring. Haqiqiy kabinetda ham xuddi shunday ishlaydi.</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.title} className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.08] py-2 pr-2 pl-4 text-[14px]">
            <span className="min-w-0 font-semibold">{item.title}</span>
            {item.ok
              ? <span className="flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-[13px] font-bold text-gold"><Check size={15} strokeWidth={3} />Tasdiqlandi</span>
              : <button type="button" onClick={() => setItems(items.map((row, n) => (n === i ? { ...row, ok: true } : row)))} className="min-h-11 shrink-0 rounded-xl bg-gold px-3.5 text-[13px] font-extrabold text-ink active:scale-95">Tasdiqlash</button>}
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

function Cabinet({ cabinet }: { cabinet: string }) {
  const features: [string, string, ReactNode][] = [
    ['Kontent kalendari', 'Qaysi kuni nima chiqishi oldindan ko‘rinadi.', <CalendarCheck key="c" size={20} />],
    ['Tasdiqlash', 'Har bir video va dizaynni chiqishidan oldin o‘zingiz ko‘rib tasdiqlaysiz.', <Check key="t" size={20} />],
    ['Hisobot va natijalar', 'Oylik hisobot, ko‘rsatkichlar, reklama natijalari va lidlar.', <BarChart3 key="h" size={20} />],
  ]
  return (
    <section id="kabinet" className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:py-24">
      <SectionTitle kicker="Bizning farqimiz" sub="Barcha tariflarda telefoningizda shaxsiy kabinet beriladi. Jamoa nima qilayotganini so‘rab yurmaysiz, o‘zingiz ko‘rib turasiz.">
        Hammasi <span className="mark">ko‘z oldingizda</span>
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-3">
          {features.map(([title, text, icon]) => (
            <li key={title} className="flex gap-4 rounded-[22px] bg-white p-5 shadow-card">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold-soft">{icon}</span>
              <span><b className="block font-display text-[17px]">{title}</b><span className="text-[15px] leading-relaxed text-text-2">{text}</span></span>
            </li>
          ))}
        </ul>
        <CrmDemo cabinet={cabinet} />
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="savollar" className="bg-ivory py-14 lg:py-24">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionTitle kicker="Shartlar">Ochiq <span className="serif text-[1.12em]">gaplashamiz</span></SectionTitle>
          <div className="space-y-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-white px-5">
                <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15.5px] font-bold">
                  {q}<Plus size={19} className="faq-plus shrink-0" />
                </summary>
                <p className="pb-4 text-[15px] leading-relaxed text-text-2">{a}</p>
              </details>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle kicker="Alohida kelishuv asosida">Qo‘shimcha <span className="mark">xizmatlar</span></SectionTitle>
          <div className="space-y-2">
            {EXTRAS.map((item) => (
              <div key={item.title} className="flex items-center gap-4 rounded-2xl bg-white p-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold-soft">{item.icon}</span>
                <span><b className="block font-display text-[15.5px] font-semibold">{item.title}</b><span className="text-[14px] text-text-2">{item.text}</span></span>
              </div>
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
    <section id="aloqa" className="relative isolate overflow-hidden bg-gold py-14 text-ink lg:py-24">
      <TargetMark size={520} color="#121210" className="pointer-events-none absolute -right-48 -bottom-48 -z-10 opacity-10" />
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Kicker>Aloqa</Kicker>
        <h2 className="display max-w-[860px] text-[clamp(32px,8.6vw,72px)]">Qaysi tarif mos kelishini <span className="serif text-[1.12em]">birga</span> aniqlaymiz</h2>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a href={`tel:${PHONE}`} className="num font-display text-[clamp(27px,8.2vw,60px)] leading-tight font-bold tracking-[-0.03em] whitespace-nowrap underline-offset-4 hover:underline">{PHONE_TEXT}</a>
          <button type="button" onClick={copy} aria-label={copied ? 'Raqam nusxalandi' : 'Raqamni nusxalash'} className="grid h-11 w-11 place-items-center rounded-full bg-ink/10">{copied ? <Check size={17} /> : <Copy size={17} />}</button>
        </div>
        <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
          <a href={TELEGRAM} target="_blank" rel="noreferrer" className="flex min-h-[68px] items-center gap-3.5 rounded-2xl bg-ink p-4 text-ivory"><TelegramIcon /><span><b className="block text-[15px]">@im_ibrokhimov</b><span className="text-[12.5px] text-ivory/70">Telegram</span></span></a>
          <a href={INSTAGRAM} target="_blank" rel="noreferrer" className="flex min-h-[68px] items-center gap-3.5 rounded-2xl bg-white p-4"><InstagramIcon /><span><b className="block text-[15px]">@obroagency</b><span className="text-[12.5px] text-text-2">Instagram: ishlarimiz</span></span></a>
          <a href={MAP} target="_blank" rel="noreferrer" className="flex min-h-[68px] items-center gap-3.5 rounded-2xl bg-white p-4"><MapPin size={20} /><span><b className="block text-[15px]">C-space coworking</b><span className="text-[12.5px] text-text-2">Farg‘ona</span></span></a>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 p-4">
          <img src="/icon-192.png" alt="" width="44" height="44" className="rounded-xl" />
          <div className="min-w-0 flex-1 basis-[calc(100%-60px)] sm:basis-0"><b className="block text-[15px]">OBRO ilovasi</b><span className="text-[13.5px] text-text-2">Kabinet telefoningizda alohida ilova bo‘lib ochiladi</span></div>
          <InstallApp look="dark" label="O‘rnatish" className="w-full sm:w-auto" />
        </div>
      </div>
    </section>
  )
}

export function LandingPage() {
  const { user } = useAuth()
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const previous = document.title
    const theme = document.querySelector('meta[name="theme-color"]')
    const previousTheme = theme?.getAttribute('content')
    document.title = 'OBRO AGENCY — SMM agentlik | Tariflar va narxlar'
    theme?.setAttribute('content', '#FFC21F')
    document.documentElement.classList.add('landing-open')
    return () => {
      document.title = previous
      if (previousTheme) theme?.setAttribute('content', previousTheme)
      document.documentElement.classList.remove('landing-open')
    }
  }, [])

  const cabinet = user ? (user.is_client ? '/portal' : '/app') : '/login'

  return (
    <div className="landing min-h-screen bg-paper pb-[76px] text-ink lg:pb-0">
      <header className="fixed inset-x-2.5 top-[calc(env(safe-area-inset-top)+10px)] z-40 mx-auto max-w-[1240px] rounded-[22px] bg-white/90 shadow-[0_10px_30px_-14px_rgb(18_18_16/0.35)] backdrop-blur-xl sm:inset-x-5 sm:top-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex h-[60px] items-center justify-between gap-2 pr-2 pl-3.5 sm:pl-5">
          <a href="#bosh" aria-label="OBRO AGENCY, bosh sahifa" onClick={() => setMenu(false)} className="flex min-h-11 items-center gap-2 font-display text-[12.5px] font-bold whitespace-nowrap sm:text-[14px]">
            <TargetMark size={24} color="#121210" />OBRO AGENCY
          </a>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Asosiy menyu">
            {NAV.map(([href, label]) => <a key={href} href={href} className="text-[14px] font-bold text-text-2 transition-colors hover:text-ink">{label}</a>)}
          </nav>
          <div className="flex items-center gap-1.5">
            <a href={`tel:${PHONE}`} className="num hidden min-h-11 items-center px-3 text-[14px] font-bold xl:flex">{PHONE_TEXT}</a>
            <Link to={cabinet} className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-ink px-3.5 text-[13.5px] font-extrabold text-ivory active:scale-[0.97] sm:px-5">
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
            <InstallApp look="dark" label="Ilovani o‘rnatish" className="my-2 w-full" />
          </nav>
        )}
      </header>

      <main>
        <Hero />
        <Tariffs />
        <Services />
        <Cabinet cabinet={cabinet} />
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
