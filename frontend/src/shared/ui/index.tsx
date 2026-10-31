import clsx from 'clsx'
import type { ClassValue } from 'clsx'
import { X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { useEffect } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { TargetMark } from './Logo'

export { Logo, TargetMark } from './Logo'

// Sahifadan berilgan klass (masalan, border-gold) komponentning standart klassini to'g'ri almashtiradi.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type Variant = 'primary' | 'dark' | 'ghost' | 'danger' | 'quiet'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gold text-ink font-bold shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)] hover:bg-[#ffcb45]',
  dark: 'bg-ink text-ivory font-semibold hover:bg-ink-3',
  ghost: 'bg-white text-ink font-semibold border border-line-strong hover:border-muted-2 hover:bg-ivory/60',
  danger: 'bg-white text-bad font-semibold border border-bad/30 hover:bg-bad-soft',
  quiet: 'text-text-2 font-semibold hover:bg-ivory hover:text-ink',
}

// Tugma: kamida 40px balandlik (bosish maydoni), bosilganda biroz kichrayadi.
export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[13.5px] whitespace-nowrap',
        'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant], className,
      )}
      {...props}
    />
  )
}

// cut — eski API bilan moslik uchun qoldirilgan, endi alohida bezak bermaydi.
export function Card({ className, children }: { className?: string; children: ReactNode; cut?: boolean }) {
  return <div className={cn('rounded-2xl border border-line-soft bg-white p-5 shadow-card', className)}>{children}</div>
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mono mb-2 text-[10.5px] tracking-[0.14em] text-muted uppercase', className)}>{children}</div>
}

export function PageHeader({ title, accent, subtitle, actions }: { title: ReactNode; accent?: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[24px] leading-[1.15] font-semibold tracking-[-0.01em] sm:text-[27px]">
          {title}{accent && <> <span className="accent text-[1.12em]">{accent}</span></>}
        </h1>
        {subtitle && <div className="mt-1.5 text-[13.5px] text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const TONES = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  draft: 'bg-ivory text-text-2',
  gold: 'bg-gold text-ink',
  dark: 'bg-ink text-gold',
}
export type Tone = keyof typeof TONES

export function Badge({ tone = 'draft', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap', TONES[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

// Holat → rang. Qizil — xavf, yashil — tayyor/to'langan, to'q sariq — sizdan javob kutilmoqda, ko'k — jarayonda.
export const STATUS_TONE: Record<string, Tone> = {
  paid: 'ok', approved: 'ok', published: 'ok', done: 'ok', active: 'ok',
  partial: 'warn', open: 'warn', client_review: 'warn', submitted: 'warn', requested: 'warn', awaiting_you: 'warn',
  overdue: 'bad', changes: 'bad', rejected: 'bad', cancelled: 'draft', churned: 'draft',
  draft: 'draft', idea: 'draft', lead: 'info', in_work: 'info', script: 'info', shooting: 'info',
  editing: 'info', internal_review: 'info', in_progress: 'info', todo: 'draft', paused: 'draft',
  sent: 'warn', review: 'warn', planned: 'info',
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'draft'} dot>{label}</Badge>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-bold text-text-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-snug text-muted">{hint}</span>}
    </label>
  )
}

const INPUT = cn(
  'w-full min-h-10 rounded-[10px] border border-line-strong bg-white px-3 py-2 text-[14px] text-ink outline-none',
  'placeholder:text-muted-2 transition-[border-color,box-shadow] duration-150',
  'focus:border-gold-deep focus:shadow-[0_0_0_3px_rgb(255_194_31/0.28)] disabled:bg-ivory disabled:text-muted',
)

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT, props.className)} />
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(INPUT, 'cursor-pointer pr-8', props.className)}>{children}</select>
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(INPUT, 'leading-relaxed', props.className)} />
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-start justify-center overflow-y-auto bg-ink/45 p-4 pt-[7vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cn('w-full animate-enter rounded-3xl bg-white p-6 shadow-raise', wide ? 'max-w-2xl' : 'max-w-md')}
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} className="-m-2 grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-ivory hover:text-ink" aria-label="Yopish"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12" role="status" aria-label="Yuklanmoqda">
      <TargetMark size={34} className="animate-pulse" />
    </div>
  )
}

// Bo'sh holat: slayddagi nishon belgisi, kulrang halqalar va oltin nuqta.
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <svg width="52" height="52" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="27.6" fill="none" stroke="#e4ded1" strokeWidth="4.8" />
        <circle cx="32" cy="32" r="16" fill="none" stroke="#e4ded1" strokeWidth="4.8" />
        <circle cx="32" cy="32" r="5.8" fill="#ffc21f" />
      </svg>
      <div className="mt-4 font-display text-[15px] font-semibold">{title}</div>
      {hint && <div className="mt-1.5 max-w-sm text-[13px] text-muted">{hint}</div>}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  return <div role="alert" className="rounded-xl border border-bad/20 bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">{message}</div>
}

// Tarif limiti halqasi: kulrang yo'lak ustida oltin progress.
export function Ring({ done, planned, label, size = 84 }: { done: number; planned: number; label: string; size?: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const share = planned > 0 ? Math.min(done / planned, 1) : 0
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${label}: ${done} / ${planned}`}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#eee9de" strokeWidth="6" />
        {share > 0 && (
          <circle cx="32" cy="32" r={r} fill="none" stroke="#ffc21f" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 32 32)" className="transition-[stroke-dasharray] duration-500" />
        )}
        <text x="32" y="30.5" textAnchor="middle" fontFamily="Unbounded" fontWeight="700" fontSize="12" fill="#121210">{done}</text>
        <text x="32" y="42" textAnchor="middle" fontFamily="Space Mono" fontSize="7.5" fill="#6f6a5f">/ {planned}</text>
      </svg>
      <span className="text-[12px] font-semibold text-text-2">{label}</span>
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'dark' }) {
  return (
    <div className={cn('rounded-2xl border p-5 shadow-card', tone === 'dark' ? 'border-ink bg-ink text-ivory' : 'border-line-soft bg-white')}>
      <Kicker className={tone === 'dark' ? 'text-muted-2' : undefined}>{label}</Kicker>
      <div className="num font-display text-[22px] leading-tight font-semibold">{value}</div>
      {hint && <div className={cn('mt-1 text-[12.5px]', tone === 'dark' ? 'text-muted-2' : 'text-muted')}>{hint}</div>}
    </div>
  )
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft bg-white shadow-card">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => <th key={i} className="mono bg-ivory/70 px-4 py-3 text-left text-[10.5px] font-normal tracking-[0.1em] whitespace-nowrap text-muted uppercase">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-line-soft [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_tr:last-child_td]:border-0 [&_tr]:transition-colors [&_tr:hover]:bg-paper">{children}</tbody>
      </table>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div role="tablist" className="mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line-soft bg-white p-1 shadow-card">
      {items.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={value === key} onClick={() => onChange(key)}
          className={cn('min-h-9 rounded-lg px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors duration-150',
            value === key ? 'bg-ink text-ivory' : 'text-muted hover:bg-ivory hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  )
}
