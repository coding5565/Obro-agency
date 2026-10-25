// Raqam va sanalarni o'zbekcha ko'rsatish: 12 650 000 so‘m, $1 000, 02.11.2026.
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr',
  'noyabr', 'dekabr']

function groupDigits(value: string) {
  const [whole, fraction] = value.split('.')
  const sign = whole.startsWith('-') ? '-' : ''
  const digits = whole.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const tail = fraction && Number(fraction) !== 0 ? `,${fraction}` : ''
  return `${sign}${digits}${tail}`
}

export function money(amount: string | number | null | undefined, currency: string = 'UZS') {
  if (amount === null || amount === undefined || amount === '') return '—'
  const text = groupDigits(String(amount))
  return currency === 'USD' ? `$${text}` : `${text} so‘m`
}

// Kurs: 11838.9200 → «11 838,92 so‘m»
export function rate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  return `${groupDigits(Number(value).toFixed(2))} so‘m`
}

export function num(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return groupDigits(String(value))
}

// 12.5 → «12,5%» (o'zbekchada kasr vergul bilan)
export function pct(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  return `${String(Number(value)).replace('.', ',')}%`
}

export function date(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function dateTime(value: string | null | undefined) {
  if (!value) return '—'
  const dt = new Date(value)
  return `${date(value)} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const KIND_LABELS: Record<string, string> = { post: 'Post', reels: 'Reels', stories: 'Stories', video: 'Video' }
