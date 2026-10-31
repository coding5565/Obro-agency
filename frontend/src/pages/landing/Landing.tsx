import { ArrowRight, ArrowUpRight, Check, Clapperboard, Lightbulb, LogIn, MapPin, Menu, Minus, Sparkles, Star, Target, TrendingUp, UserRound, Video, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { TargetMark } from '../../shared/ui/Logo'
import './landing.css'

// Barcha matn va narxlar tijoriy taklifdan (OBRO_Agency_Tijoriy_taklif). Yangi raqam o'ylab topilmaydi.
const TELEGRAM = 'https://t.me/Mirzohid_Vahobov'
const TELEGRAM_2 = 'https://t.me/im_ibrokhimov'
const INSTAGRAM = 'https://www.instagram.com/obro.agency/'
const MAP = 'https://www.google.com/maps/search/?api=1&query=C-space+coworking+Farg%27ona'

const NAV: [string, string][] = [['#haqimizda', 'Biz haqimizda'], ['#jarayon', 'Jarayon'], ['#tariflar', 'Tariflar'], ['#afzalliklar', 'Afzalliklar'], ['#aloqa', 'Aloqa']]

const ABOUT: [string, string][] = [
  ['Kompleks yondashuv', 'Kontent, dizayn va reklamani bir tizimda boshqaramiz.'],
  ['Individual strategiya', 'Har bir biznesning maqsadi va auditoriyasiga mos yondashuv.'],
  ['Tizimli ish jarayoni', 'Oldindan rejalashtirilgan kontent va reklama faoliyati.'],
  ['Natijalar tahlili', 'Reklama ko‘rsatkichlarini kuzatib, keyingi qarorlarni optimallashtiramiz.'],
]

const STEPS: { title: string; text: string; icon: ReactNode }[] = [
  { title: 'G‘oya va strategiya', text: 'Maqsadli auditoriya, raqobatchilar va bozor tahlili asosida kontent strategiyasini yaratamiz.', icon: <Lightbulb size={20} /> },
  { title: 'Kontent ishlab chiqarish', text: 'Video olish, montaj, dizayn va matnlarni tayyorlaymiz. Brendingizga mos, sifatli kontent yaratamiz.', icon: <Video size={20} /> },
  { title: 'Reklama va test', text: 'Turli kreativlarni sinab, eng samarali auditoriyani aniqlaymiz va reklama kampaniyalarini yuritamiz.', icon: <Target size={20} /> },
  { title: 'Tahlil va optimallashtirish', text: 'Ko‘rishlar, murojaatlar, lidlar va xarajatlarni kuzatib, natijalarni yaxshilaymiz.', icon: <TrendingUp size={20} /> },
]

interface Plan { name: string; price: number; counts: [number, string][]; extras: string[]; bonus: boolean; featured?: boolean }

const PLANS: Plan[] = [
  { name: 'Basic', price: 800, counts: [[4, 'post dizayni va matn'], [15, 'kreativ Stories'], [10, 'Reels']], extras: ['Target reklama sozlamalari', '1 oylik kontent-reja'], bonus: false },
  { name: 'Standard', price: 1000, counts: [[6, 'post dizayni va matn'], [20, 'Stories'], [12, 'Reels']], extras: ['Profilni optimallashtirish', 'Target reklama sozlamalari', '1 oylik kontent-reja'], bonus: true, featured: true },
  { name: 'Premium', price: 1500, counts: [[10, 'post dizayni va matn'], [20, 'Stories'], [15, 'Reels']], extras: ['Profil va brend tahlili', 'Target reklama sozlamalari', '1 oylik kontent-reja'], bonus: true },
]

const COMPARE: [string, ReactNode, ReactNode, ReactNode][] = [
  ['Post dizayni va matn', '4', '6', '10'],
  ['Stories', '15', '20', '20'],
  ['Reels', '10', '12', '15'],
  ['Profil bilan ishlash', <Minus key="m" size={16} className="inline text-muted" aria-label="Yo‘q" />, 'Optimallashtirish', 'Profil va brend tahlili'],
  ['Target reklama sozlamalari', <Check key="a" size={17} className="inline text-gold" aria-label="Bor" />, <Check key="b" size={17} className="inline text-gold" aria-label="Bor" />, <Check key="c" size={17} className="inline text-gold" aria-label="Bor" />],
  ['1 oylik kontent-reja', <Check key="d" size={17} className="inline text-gold" aria-label="Bor" />, <Check key="e" size={17} className="inline text-gold" aria-label="Bor" />, <Check key="f" size={17} className="inline text-gold" aria-label="Bor" />],
  ['Bonus', <Minus key="n" size={16} className="inline text-muted" aria-label="Yo‘q" />, 'Studiya + CRM', 'Studiya + CRM'],
]

const FOR_WHOM: [string, string][] = [
  ['Basic', 'Yangi bizneslar, shaxsiy brendlar va ijtimoiy tarmoqlarini tartibga keltirmoqchi bo‘lgan kompaniyalar uchun.'],
  ['Standard', 'Faoliyatini tizimli yo‘lga qo‘yishni, brend imijini yaxshilashni va sifatli kontent orqali yangi mijozlarni jalb qilishni istagan, rivojlanayotgan bizneslar uchun.'],
  ['Premium', 'Marketingga jiddiy investitsiya qilayotgan, bozordagi o‘rnini kuchaytirish va tizimli rivojlanishni maqsad qilgan bizneslar uchun.'],
]

const WHY: [string, string][] = [
  ['Strategik yondashuv', 'Har bir kontent maqsadli va natijaga yo‘naltirilgan.'],
  ['Professional jamoa', 'Tajriba, ijod va marketing bilimlarini birlashtiramiz.'],
  ['Zamonaviy uslublar', 'Trendlarga mos, sifatli va brendga mos kontent yaratamiz.'],
  ['Natijaga yo‘naltirilganlik', 'Murojaatlar, lidlar va savdo ko‘rsatkichlarini kuzatamiz.'],
  ['Doimiy aloqa', 'Siz bilan ochiq va samarali muloqot olib boramiz.'],
]

const EXTRAS: { title: string; text: string; icon: ReactNode }[] = [
  { title: 'Video suratga olish', text: 'Lokatsiya, uskunalar.', icon: <Video size={20} /> },
  { title: 'Model yoki Brend face', text: 'Professional.', icon: <UserRound size={20} /> },
  { title: 'Lokatsiya', text: 'Suratga olish uchun mos joy tanlash.', icon: <MapPin size={20} /> },
  { title: 'Qo‘shimcha ishlab chiqarish', text: 'Dizayn, animatsiya, 3D va boshqa xizmatlar.', icon: <Sparkles size={20} /> },
]

const TERMS = [
  'Xizmatlar oylik paket asosida taqdim etiladi.',
  'Target reklama uchun reklama budjeti alohida kelishiladi.',
  'Suratga olish kunlari, model, lokatsiya va qo‘shimcha xarajatlar paket tarkibiga kirmaydi, agar alohida kelishilmagan bo‘lsa.',
  'Kontent kalendari va materiallarni tasdiqlash jarayoni hamkorlik boshida kelishib olinadi.',
  'Natijalar biznes sohasi, taklif sifati, auditoriya va reklama budjetiga bog‘liq.',
  'Muayyan savdo yoki lidlar soni kafolatlanmaydi.',
]

function telegramFor(plan: string) {
  return `${TELEGRAM}?text=${encodeURIComponent(`Assalomu alaykum! ${plan} tarifi haqida bilmoqchi edim.`)}`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
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

function Logo({ dark }: { dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-[14px] font-bold tracking-[0.02em] whitespace-nowrap ${dark ? 'text-ink' : 'text-ivory'}`}>
      <TargetMark size={26} color={dark ? '#121210' : '#FFC21F'} />
      OBRO AGENCY
    </span>
  )
}

function Label({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={`mono mb-5 flex items-center gap-2.5 text-[11.5px] tracking-[0.18em] uppercase ${dark ? 'text-ink/70' : 'text-muted-2'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dark ? 'bg-ink' : 'bg-gold'}`} />
      {children}
    </div>
  )
}

function Rings({ className, color = '#FFC21F', width = 1 }: { className?: string; color?: string; width?: number }) {
  return (
    <svg className={`pointer-events-none absolute ${className ?? ''}`} viewBox="0 0 400 400" fill="none" aria-hidden>
      <circle cx="200" cy="200" r="198" stroke={color} strokeWidth={width} opacity="0.3" />
      <circle cx="200" cy="200" r="140" stroke={color} strokeWidth={width} opacity="0.5" />
      <circle cx="200" cy="200" r="84" stroke={color} strokeWidth={width} opacity="0.8" />
      <circle cx="200" cy="200" r="24" fill={color} />
    </svg>
  )
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <div data-reveal className={className} style={{ '--d': `${delay}ms` } as CSSProperties}>{children}</div>
}

function PhoneMock() {
  const play = <span className="h-0 w-0 border-y-[9px] border-l-[15px] border-y-transparent border-l-current" />
  const tiles: [string, ReactNode][] = [
    ['bg-ink text-gold', play],
    ['bg-gold text-ink', <TargetMark key="t" size={30} color="#121210" />],
    ['bg-ivory', null],
    ['bg-ivory text-ink', <span key="l" className="block w-9 space-y-1"><i className="block h-1 rounded bg-ink" /><i className="block h-1 w-7 rounded bg-gold-deep" /><i className="block h-1 w-5 rounded bg-ink" /></span>],
    ['bg-ink text-gold', <TrendingUp key="c" size={28} />],
    ['bg-gold text-ink', play],
    ['bg-gold', null],
    ['bg-ivory', null],
    ['bg-ink', null],
  ]
  return (
    <div className="tilt relative mx-auto w-[280px] rounded-[44px] border border-white/10 bg-[#0a0a09] p-2.5 shadow-[0_50px_100px_-30px_rgb(0_0_0/0.9),0_0_90px_-30px_rgb(255_194_31/0.4)] sm:w-[310px]">
      <div className="overflow-hidden rounded-[35px] bg-paper text-ink">
        <div className="relative px-4 pt-8 pb-3">
          <span className="absolute top-2.5 left-1/2 h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-[#0a0a09]" />
          <div className="mb-3 text-[13px] font-extrabold">obro.agency</div>
          <div className="flex items-center gap-3">
            <span className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full bg-ink ring-2 ring-gold ring-offset-2 ring-offset-paper"><TargetMark size={36} /></span>
            <div className="flex flex-1 justify-between text-center text-[10px] leading-tight text-text-2">
              <span><b className="block font-display text-[14px] text-ink">48</b>post</span>
              <span><b className="block font-display text-[14px] text-ink">Reels</b>video</span>
              <span><b className="block font-display text-[14px] text-ink">Ads</b>target</span>
            </div>
          </div>
          <div className="mt-2.5 text-[11.5px] font-extrabold">OBRO AGENCY · SMM agentlik</div>
          <div className="text-[10px] text-muted">Marketing • Content • Target • Growth</div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-center text-[11px] font-bold">
            <span className="rounded-lg bg-gold py-1.5">Bog‘lanish</span>
            <span className="rounded-lg bg-ivory py-1.5">Tariflar</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-[2px]">
          {tiles.map(([cls, child], i) => <div key={i} className={`grid aspect-square place-items-center ${cls}`}>{child}</div>)}
        </div>
      </div>
    </div>
  )
}

function CrmMock() {
  const rows: [string, string, string][] = [
    ['Reels: bahor aksiyasi', 'Sizning tasdig‘ingizda', 'bg-gold/20 text-gold'],
    ['Post: yangi xizmat', 'Tasdiqlandi', 'bg-[#1f7a4d]/25 text-[#6fd19f]'],
    ['Stories: kun taklifi', 'Joylandi', 'bg-[#1f7a4d]/25 text-[#6fd19f]'],
  ]
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-ink-2 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <span className="flex items-center gap-2 font-display text-[11.5px] font-bold"><TargetMark size={17} />Mijoz kabineti</span>
        <span className="mono text-[10px] tracking-[0.14em] text-muted-2 uppercase">Namuna</span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4 text-[11.5px] sm:gap-3 sm:p-5">
        {['Kontent reja', 'Tasdiqlash', 'Hisobotlar'].map((t) => (
          <div key={t} className="rounded-xl border border-white/10 p-3 font-bold">
            <span className="mb-3 block h-1.5 overflow-hidden rounded-full bg-white/10"><i className="block h-full w-2/3 rounded-full bg-gold" /></span>
            {t}
          </div>
        ))}
      </div>
      <div className="space-y-2 px-4 pb-5 sm:px-5">
        {rows.map(([title, state, tone]) => (
          <div key={title} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3 text-[12.5px]">
            <span className="min-w-0 truncate font-semibold">{title}</span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${tone}`}>{state}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LandingPage() {
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLElement>(null)

  useEffect(() => {
    const previous = document.title
    document.title = 'OBRO AGENCY — SMM agentlik | Marketing, kontent, target'
    document.documentElement.classList.add('landing-open')
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.title = previous
      document.documentElement.classList.remove('landing-open')
      window.removeEventListener('scroll', onScroll)
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
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  function onPointer(e: React.PointerEvent) {
    const box = hero.current
    if (!box || e.pointerType !== 'mouse') return
    const rect = box.getBoundingClientRect()
    box.style.setProperty('--mx', String((e.clientX - rect.left) / rect.width - 0.5))
    box.style.setProperty('--my', String((e.clientY - rect.top) / rect.height - 0.5))
  }

  const cabinet = user ? (user.is_client ? '/portal' : '/app') : '/login'

  return (
    <div ref={root} className="landing min-h-screen bg-ink text-ivory">
      {/* Yuqori menyu */}
      <header className={`fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-300 ${scrolled || menu ? 'border-b border-white/10 bg-ink/85 backdrop-blur-xl' : 'border-b border-transparent'}`}>
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8">
          <a href="#bosh" aria-label="OBRO AGENCY, bosh sahifa" onClick={() => setMenu(false)}><Logo /></a>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Asosiy menyu">
            {NAV.map(([href, label]) => <a key={href} href={href} className="text-[14px] font-semibold text-ivory/70 transition-colors hover:text-ivory">{label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <a href={TELEGRAM} target="_blank" rel="noreferrer" className="hidden min-h-11 items-center rounded-full px-4 text-[14px] font-bold text-ivory/80 transition-colors hover:text-ivory md:inline-flex">Bog‘lanish</a>
            <Link to={cabinet} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]">
              <LogIn size={16} />{user ? 'Kabinet' : 'Login'}
            </Link>
            <button type="button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Menyuni yopish' : 'Menyuni ochish'} aria-expanded={menu} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 lg:hidden">
              {menu ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="border-t border-white/10 px-5 py-3 lg:hidden" aria-label="Mobil menyu">
            {NAV.map(([href, label]) => <a key={href} href={href} onClick={() => setMenu(false)} className="flex min-h-12 items-center justify-between border-b border-white/[0.06] text-[16px] font-bold last:border-0">{label}<ArrowRight size={16} className="text-gold" /></a>)}
          </nav>
        )}
      </header>

      <main>
        {/* Muqova */}
        <section id="bosh" ref={hero} onPointerMove={onPointer} className="grain relative isolate overflow-hidden pt-[112px] pb-20 sm:pt-[132px] lg:min-h-[100svh] lg:pb-24">
          <div className="glow absolute top-[8%] right-[-12%] -z-10 h-[780px] w-[780px]" />
          <svg className="spin pointer-events-none absolute top-1/2 right-[-340px] -z-10 hidden h-[1000px] w-[1000px] -translate-y-1/2 lg:block xl:right-[-220px]" viewBox="0 0 1000 1000" fill="none" aria-hidden>
            <circle cx="500" cy="500" r="498" stroke="#f3efe6" strokeOpacity="0.07" />
            <circle cx="500" cy="500" r="380" stroke="#f3efe6" strokeOpacity="0.09" />
            <circle cx="500" cy="500" r="380" stroke="#FFC21F" strokeWidth="2" strokeDasharray="4 12" pathLength="1200" strokeDashoffset="0" opacity="0.55" />
            <circle cx="500" cy="500" r="262" stroke="#f3efe6" strokeOpacity="0.1" />
          </svg>
          <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:gap-8">
            <div>
              <h1>
                <span className="hero-in display block text-[clamp(84px,17.5vw,196px)] leading-[0.86] lg:text-[min(13.5vw,196px)] tracking-[-0.045em] text-gold">OBRO</span>
                <span className="hero-in mt-1 block font-display text-[clamp(38px,8vw,88px)] leading-[1] font-semibold tracking-[-0.01em] text-ivory" style={{ '--d': '90ms' } as CSSProperties}>AGENCY</span>
              </h1>
              <div className="hero-in mono mt-6 text-[10px] tracking-[0.13em] whitespace-nowrap text-ivory/70 uppercase sm:text-[12.5px] sm:tracking-[0.24em]" style={{ '--d': '170ms' } as CSSProperties}>Marketing • Content • Target • Growth</div>
              <p className="hero-in mt-8 max-w-[580px] text-[clamp(20px,2.3vw,27px)] leading-[1.28] font-bold" style={{ '--d': '240ms' } as CSSProperties}>
                Biznesingizni ijtimoiy tarmoqlarda rivojlantiring va yangi mijozlarni <span className="serif text-[1.16em] text-gold">jalb qiling!</span>
              </p>
              <p className="hero-in mt-4 max-w-[540px] text-[15.5px] leading-relaxed text-ivory/65" style={{ '--d': '300ms' } as CSSProperties}>
                OBRO AGENCY — biznesingizning raqamli imijini shakllantirish, kontent sifatini oshirish va maqsadli reklama orqali potensial mijozlarni jalb qilishga ixtisoslashgan SMM agentlik.
              </p>
              <div className="hero-in mt-9 flex flex-wrap gap-3" style={{ '--d': '370ms' } as CSSProperties}>
                <a href="#tariflar" className="group inline-flex min-h-14 items-center gap-3 rounded-full bg-gold px-7 text-[15.5px] font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]">
                  Tarifni tanlash<ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-1" />
                </a>
                <a href={TELEGRAM} target="_blank" rel="noreferrer" className="inline-flex min-h-14 items-center gap-2.5 rounded-full border border-white/20 px-7 text-[15.5px] font-bold transition-colors duration-200 hover:border-gold hover:text-gold">
                  <TelegramIcon size={18} />Telegram’da yozish
                </a>
              </div>
            </div>
            <div className="hero-in relative py-6" style={{ '--d': '220ms' } as CSSProperties}>
              <PhoneMock />
              <div className="float-a absolute top-[1%] left-[calc(50%-205px)] flex items-center gap-2.5 rounded-2xl bg-paper py-2 pr-4 pl-2 text-ink shadow-2xl max-sm:left-1 sm:left-[calc(50%-225px)]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-gold"><Clapperboard size={16} /></span>
                <span className="text-[11px] leading-tight text-muted"><b className="block text-[13px] text-ink">Reels</b>Video kontent</span>
              </div>
              <div className="float-b absolute right-[calc(50%-205px)] bottom-[17%] flex items-center gap-2.5 rounded-2xl bg-paper py-2 pr-4 pl-2 text-ink shadow-2xl max-sm:right-1 sm:right-[calc(50%-225px)]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold"><Target size={17} /></span>
                <span className="text-[11px] leading-tight text-muted"><b className="block text-[13px] text-ink">Target</b>Maqsadli reklama</span>
              </div>
            </div>
          </div>
        </section>

        {/* Lenta */}
        <div className="on-gold overflow-hidden bg-gold py-4 text-ink" aria-hidden>
          <div className="marquee">
            {[0, 1].map((group) => (
              <div key={group} className="flex shrink-0 items-center">
                {['Marketing', 'Content', 'Target', 'Growth', 'Marketing', 'Content', 'Target', 'Growth'].map((word, i) => (
                  <span key={i} className="flex items-center gap-7 pr-7 font-display text-[19px] font-bold tracking-[-0.01em] sm:text-[24px]">{word}<TargetMark size={20} color="#121210" /></span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Biz haqimizda */}
        <section id="haqimizda" className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-36">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
            <Reveal>
              <Label>Biz haqimizda</Label>
              <h2 className="display text-[clamp(34px,5vw,60px)]">Bizning maqsadimiz — sizning <span className="serif text-[1.14em] text-gold">o‘sishingiz!</span></h2>
              <p className="mt-6 max-w-[500px] text-[17px] leading-relaxed text-ivory/65">OBRO AGENCY bizneslarning raqamli imijini shakllantirish, kontent sifatini oshirish va maqsadli reklama orqali potensial mijozlarni jalb qilishga yo‘naltirilgan SMM agentligi.</p>
            </Reveal>
            <div className="grid gap-3 sm:grid-cols-2">
              {ABOUT.map(([title, text], i) => (
                <Reveal key={title} delay={i * 70}>
                  <div className="lift h-full rounded-3xl border border-white/10 bg-ink-2 p-7">
                    <div className="mono mb-10 text-[12px] text-gold">{pad(i + 1)}</div>
                    <h3 className="mb-2 font-display text-[16.5px] leading-snug font-semibold">{title}</h3>
                    <p className="text-[14.5px] leading-relaxed text-ivory/60">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Yondashuv */}
        <section className="on-gold relative isolate overflow-hidden bg-gold text-ink">
          <Rings className="pulse-ring -right-[150px] -bottom-[190px] -z-10 h-[560px] w-[560px] sm:-right-[70px] lg:h-[720px] lg:w-[720px]" color="#121210" />
          <div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-36">
            <Reveal><Label dark>Bizning yondashuvimiz</Label></Reveal>
            <h2 className="display text-[clamp(40px,8.2vw,108px)]">
              <Reveal>Biz shunchaki</Reveal>
              <Reveal delay={80}>kontent</Reveal>
              <Reveal delay={160}><span className="serif text-[1.1em]">joylashtirmaymiz.</span></Reveal>
            </h2>
            <Reveal delay={240}>
              <p className="mt-9 max-w-[600px] text-[clamp(16px,1.6vw,19px)] leading-relaxed font-medium">Biznesingizning brend imiji, auditoriya bilan aloqasi va marketing faoliyatini rivojlantirishga xizmat qiladigan tizim ustida ishlaymiz.</p>
            </Reveal>
          </div>
        </section>

        {/* Jarayon */}
        <section id="jarayon" className="grain py-24 lg:py-36">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
            <Reveal>
              <Label>Ish jarayoni</Label>
              <h2 className="display text-[clamp(34px,5vw,60px)]">Biz qanday <span className="serif text-[1.14em] text-gold">ishlaymiz?</span></h2>
              <div className="mt-8 flex flex-wrap items-center gap-2.5 font-display text-[13px] font-semibold sm:text-[15px]">
                {['Kontent', 'Reklama', 'Tahlil'].map((word, i) => (
                  <span key={word} className="flex items-center gap-2.5">
                    {i > 0 && <span className="text-muted-2">+</span>}
                    <span className="rounded-full border border-white/15 bg-ink-2 px-4 py-2.5 sm:px-5">{word}</span>
                  </span>
                ))}
                <span className="text-muted-2">=</span>
                <span className="rounded-full bg-gold px-4 py-2.5 text-ink sm:px-5">Natija</span>
              </div>
            </Reveal>
            <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 90}>
                  <div className="relative">
                    <div className="mb-6 flex items-center">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold/60 text-gold">{step.icon}</span>
                      {i < STEPS.length - 1 && <span className="ml-3 hidden h-px flex-1 bg-white/15 lg:block" />}
                    </div>
                    <div className="outline-num display mb-4 text-[64px] leading-none">{pad(i + 1)}</div>
                    <h3 className="mb-2.5 font-display text-[17px] leading-snug font-semibold">{step.title}</h3>
                    <p className="text-[14.5px] leading-relaxed text-ivory/60">{step.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Tariflar */}
        <section id="tariflar" className="relative mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-36">
          <Reveal>
            <Label>Smart Start · Tariflar</Label>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <h2 className="display text-[clamp(34px,5vw,60px)]">Kichik qadamlar — <span className="serif text-[1.14em] text-gold">katta natijalarga!</span></h2>
              <p className="max-w-[300px] text-[15.5px] leading-relaxed text-ivory/60">Oylik paketlar. O‘zingizga mos rejani tanlang.</p>
            </div>
          </Reveal>
          <div className="mt-14 grid items-center gap-4 lg:grid-cols-[1fr_1.1fr_1fr]">
            {PLANS.map((plan, i) => <PlanCard key={plan.name} plan={plan} index={i} />)}
          </div>
          <Reveal><p className="mt-6 text-[13.5px] text-ivory/55"><span className="text-gold">*</span> Target reklama uchun reklama budjeti paket narxiga kirmaydi va alohida kelishiladi.</p></Reveal>

          <Reveal className="mt-24">
            <h3 className="display mb-8 text-[clamp(26px,3.4vw,40px)]">Qaysi tarif sizga <span className="serif text-[1.14em] text-gold">mos?</span></h3>
            <div className="overflow-x-auto rounded-3xl border border-white/10 bg-ink-2">
              <table className="w-full min-w-[720px] border-collapse text-left text-[14.5px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-5 font-normal"><span className="sr-only">Xizmat</span></th>
                    {PLANS.map((p) => (
                      <th key={p.name} scope="col" className={`px-6 py-5 ${p.featured ? 'bg-gold/10' : ''}`}>
                        <span className={`block font-display text-[15px] font-semibold ${p.featured ? 'text-gold' : ''}`}>{p.name}</span>
                        <span className="text-[13px] font-medium text-ivory/55">${p.price} / oy</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map(([label, ...cells]) => (
                    <tr key={label} className="border-b border-white/[0.07] last:border-0">
                      <th scope="row" className="px-6 py-4 font-semibold text-ivory/70">{label}</th>
                      {cells.map((cell, i) => <td key={i} className={`px-6 py-4 font-bold ${PLANS[i].featured ? 'bg-gold/10' : ''}`}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {FOR_WHOM.map(([name, text], i) => (
              <Reveal key={name} delay={i * 70}>
                <div className="h-full rounded-3xl border border-white/10 p-7">
                  <div className="mono mb-4 text-[11px] tracking-[0.16em] text-gold uppercase">{name} kimlar uchun</div>
                  <p className="text-[14.5px] leading-relaxed text-ivory/70">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Afzalliklar */}
        <section id="afzalliklar" className="grain border-y border-white/[0.07] py-24 lg:py-36">
          <div className="mx-auto grid max-w-[1240px] gap-14 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal className="lg:sticky lg:top-28 lg:self-start">
              <Label>Afzalliklar</Label>
              <h2 className="display text-[clamp(44px,6.4vw,84px)]">
                Nega<br /><span className="text-gold">OBRO</span><br /><span className="serif text-[1.08em]">Agency?</span>
              </h2>
              <p className="mt-7 max-w-[420px] text-[17px] leading-relaxed text-ivory/65">Biz bilan ishlash — bu faqat kontent emas, biznesingizning o‘sishiga qaratilgan hamkorlik.</p>
            </Reveal>
            <div>
              {WHY.map(([title, text], i) => (
                <Reveal key={title}>
                  <div className="row-hover grid items-center gap-x-6 gap-y-1.5 border-t border-white/10 py-6 sm:grid-cols-[40px_1fr_1.15fr]">
                    <span className="mono text-[12px] text-gold">{pad(i + 1)}</span>
                    <h3 className="font-display text-[17px] leading-snug font-semibold">{title}</h3>
                    <p className="text-[14.5px] leading-relaxed text-ivory/60">{text}</p>
                  </div>
                </Reveal>
              ))}
              <Reveal>
                <div className="on-gold mt-2 rounded-3xl bg-gold p-6 text-ink sm:p-8">
                  <div className="grid items-center gap-x-6 gap-y-1.5 sm:grid-cols-[40px_1fr_1.15fr]">
                    <span className="mono text-[12px] font-bold">06</span>
                    <h3 className="font-display text-[19px] leading-snug font-bold">CRM orqali nazorat</h3>
                    <p className="text-[14.5px] leading-relaxed font-medium">Bajarilayotgan barcha ishlar va hisobotlarni CRM tizimida istalgan vaqtda ko‘rib turasiz.</p>
                  </div>
                </div>
              </Reveal>
              <Reveal className="mt-6">
                <CrmMock />
              </Reveal>
              <Reveal className="mt-5">
                <Link to={cabinet} className="group inline-flex min-h-12 items-center gap-2.5 text-[15px] font-bold text-gold">
                  Mijoz kabinetiga kirish<ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Qo'shimcha xizmatlar va shartlar */}
        <section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-36">
          <Reveal>
            <Label>Alohida kelishuv asosida</Label>
            <h2 className="display text-[clamp(34px,5vw,60px)]">Qo‘shimcha <span className="serif text-[1.14em] text-gold">xizmatlar</span></h2>
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-ivory/65">Paketdan tashqari kerak bo‘ladigan ishlab chiqarish xizmatlari.</p>
          </Reveal>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {EXTRAS.map((item, i) => (
              <Reveal key={item.title} delay={i * 70}>
                <div className="lift h-full rounded-3xl border border-white/10 bg-ink-2 p-7">
                  <span className="mb-10 grid h-12 w-12 place-items-center rounded-2xl bg-gold text-ink">{item.icon}</span>
                  <h3 className="mb-2 font-display text-[16px] leading-snug font-semibold">{item.title}</h3>
                  <p className="text-[14.5px] leading-relaxed text-ivory/60">{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <div id="shartlar" className="mt-24 grid gap-10 lg:mt-36 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <Label>Shartlar</Label>
              <h2 className="display text-[clamp(30px,4.2vw,50px)]">Ochiq gaplashamiz, aniq shartlar bilan <span className="serif text-[1.14em] text-gold">ishlaymiz!</span></h2>
            </Reveal>
            <ol>
              {TERMS.map((term, i) => (
                <li key={term}>
                  <Reveal>
                    <div className="flex gap-5 border-t border-white/10 py-5">
                      <span className="mono shrink-0 pt-0.5 text-[12px] text-gold">{pad(i + 1)}</span>
                      <span className="text-[15.5px] leading-relaxed text-ivory/80">{term}</span>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Aloqa */}
        <section id="aloqa" className="grain relative isolate overflow-hidden border-t border-white/[0.07] py-24 lg:py-32">
          <svg className="pulse-ring absolute top-16 -right-20 -z-10 h-[280px] w-[280px] opacity-30 sm:right-[6%] sm:opacity-100 lg:h-[360px] lg:w-[360px]" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="27.6" fill="none" stroke="#ffc21f" strokeWidth="4.8" />
            <circle cx="32" cy="32" r="16" fill="none" stroke="#ffc21f" strokeWidth="4.8" />
            <circle cx="32" cy="32" r="5.8" fill="#ffc21f" />
          </svg>
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
            <Reveal>
              <Label>Aloqa</Label>
              <h2 className="display max-w-[880px] text-[clamp(36px,6.4vw,84px)]">Keling, brendingizni <span className="serif text-[1.12em] text-gold">birgalikda</span> rivojlantiramiz!</h2>
              <p className="mt-6 text-[17px] text-ivory/65">OBRO AGENCY — biznesingiz uchun strategik hamkor.</p>
            </Reveal>
            <div className="mt-14 grid gap-3 md:grid-cols-3">
              <Reveal>
                <ContactCard icon={<InstagramIcon />} label="Instagram">
                  <a href={INSTAGRAM} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1.5 hover:text-gold">@obro.agency<ArrowUpRight size={15} /></a>
                </ContactCard>
              </Reveal>
              <Reveal delay={70}>
                <ContactCard icon={<TelegramIcon />} label="Telegram">
                  <a href={TELEGRAM} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1.5 hover:text-gold">@Mirzohid_Vahobov<ArrowUpRight size={15} /></a>
                  <a href={TELEGRAM_2} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1.5 hover:text-gold">@im_ibrokhimov<ArrowUpRight size={15} /></a>
                </ContactCard>
              </Reveal>
              <Reveal delay={140}>
                <ContactCard icon={<MapPin size={20} />} label="Ofis">
                  <a href={MAP} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1.5 hover:text-gold">C-space coworking, Farg‘ona<ArrowUpRight size={15} className="shrink-0" /></a>
                </ContactCard>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-8 text-[13px] text-ivory/50 sm:px-8">
          <Logo />
          <span className="mono text-[11px] tracking-[0.14em] uppercase">Marketing • Content • Target • Growth</span>
          <span className="flex items-center gap-5">
            <span>© {new Date().getFullYear()} OBRO AGENCY</span>
            <Link to="/jamoa" className="flex min-h-9 items-center hover:text-ivory">Jamoa uchun</Link>
          </span>
        </div>
      </footer>

      <a href={TELEGRAM} target="_blank" rel="noreferrer" aria-label="Telegram’da yozish" className="fixed right-5 bottom-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-gold text-ink shadow-[0_12px_32px_-8px_rgb(255_194_31/0.6)] transition-transform duration-200 hover:scale-105 active:scale-95">
        <TelegramIcon size={22} />
      </a>
    </div>
  )
}

function PlanCard({ plan, index }: { plan: Plan; index: number }) {
  const gold = !!plan.featured
  const muted = gold ? 'text-ink/70' : 'text-ivory/55'
  return (
    <Reveal delay={index * 90} className={gold ? 'lg:z-10' : undefined}>
      <div className={`${gold ? 'on-gold bg-gold text-ink shadow-[0_40px_90px_-30px_rgb(255_194_31/0.55)] lg:py-10' : 'lift border border-white/10 bg-ink-2'} relative flex flex-col rounded-[28px] p-7 sm:p-8`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-[20px] font-bold">{plan.name}</h3>
          {gold
            ? <span className="mono inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[10px] tracking-[0.1em] text-gold uppercase"><Star size={11} fill="currentColor" />Eng maqbul</span>
            : <span className="mono text-[12px] text-muted-2">{pad(index + 1)}</span>}
        </div>
        <div className={`mt-5 flex items-start gap-1 border-b pb-6 ${gold ? 'border-ink/20' : 'border-white/10'}`}>
          <span className="mt-2 font-display text-[22px] font-bold">$</span>
          <span className="display text-[clamp(54px,6vw,72px)] leading-none tracking-[-0.04em]">{plan.price}</span>
          <span className={`mt-auto mb-2 ml-1 text-[14px] font-semibold ${muted}`}>/ oy</span>
        </div>
        <ul className="mt-6 space-y-3 text-[15px]">
          {plan.counts.map(([qty, label]) => (
            <li key={label} className="flex items-center gap-3">
              <CheckDot gold={gold} /><b className="min-w-[26px] font-display text-[15px]">{qty}</b><span className="font-medium">{label}</span>
            </li>
          ))}
          {plan.extras.map((label) => <li key={label} className="flex items-center gap-3 font-medium"><CheckDot gold={gold} />{label}</li>)}
        </ul>
        <div className="mt-7">
          {plan.bonus ? (
            <div className={`flex flex-wrap items-center gap-2 rounded-2xl p-2.5 ${gold ? 'bg-ink text-ivory' : 'border border-dashed border-white/20'}`}>
              <span className="mono px-1.5 text-[10px] tracking-[0.16em] text-gold uppercase">Bonus</span>
              <span className="rounded-lg bg-white/10 px-3 py-1.5 font-display text-[12px] font-semibold">Studiya</span>
              <span className="rounded-lg bg-white/10 px-3 py-1.5 font-display text-[12px] font-semibold">CRM</span>
            </div>
          ) : (
            <p className={`text-[12.5px] leading-snug ${muted}`}><span className="font-bold text-gold">Bonus</span> — Studiya va CRM Standard hamda Premium tariflarida beriladi.</p>
          )}
        </div>
        <a href={telegramFor(plan.name)} target="_blank" rel="noreferrer" className={`group mt-6 inline-flex min-h-13 items-center justify-center gap-2.5 rounded-full px-6 py-3.5 text-[15px] font-extrabold transition-[transform,background-color,color,border-color] duration-200 active:scale-[0.97] ${gold ? 'bg-ink text-ivory hover:scale-[1.02]' : 'border border-white/20 hover:border-gold hover:bg-gold hover:text-ink'}`}>
          Tarifni tanlash<ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-1" />
        </a>
      </div>
    </Reveal>
  )
}

function CheckDot({ gold }: { gold: boolean }) {
  return <span className={`grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full ${gold ? 'bg-ink text-gold' : 'bg-gold text-ink'}`}><Check size={12} strokeWidth={3.5} /></span>
}

function ContactCard({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="lift flex h-full items-start gap-4 rounded-3xl border border-white/10 bg-ink-2 p-6">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold text-ink">{icon}</span>
      <div className="min-w-0">
        <div className="mono mb-1 text-[10.5px] tracking-[0.16em] text-muted-2 uppercase">{label}</div>
        <div className="font-display text-[14px] font-semibold break-words">{children}</div>
      </div>
    </div>
  )
}
