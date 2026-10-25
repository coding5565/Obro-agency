import clsx from 'clsx'

// OBRO AGENCY belgisi — tijoriy taklif slaydlaridagi nishon: ikki halqa va markaziy nuqta.
// O'lchamlar slayddagi vektordan olingan (tashqi halqa : ichki halqa : nuqta ≈ 1 : 0,61 : 0,19).
export function TargetMark({ size = 28, color = '#FFC21F', className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="27.6" fill="none" stroke={color} strokeWidth="4.8" />
      <circle cx="32" cy="32" r="16" fill="none" stroke={color} strokeWidth="4.8" />
      <circle cx="32" cy="32" r="5.8" fill={color} />
    </svg>
  )
}

export function Logo({ tone = 'light', size = 'md', className }: { tone?: 'light' | 'dark'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const mark = { sm: 20, md: 26, lg: 38 }[size]
  const text = { sm: 'text-[12px]', md: 'text-[14.5px]', lg: 'text-[21px]' }[size]
  return (
    <span className={clsx('inline-flex items-center gap-2.5 font-display font-bold tracking-[0.02em] whitespace-nowrap', text,
      tone === 'light' ? 'text-ivory' : 'text-ink', className)}>
      <TargetMark size={mark} />
      OBRO AGENCY
    </span>
  )
}
