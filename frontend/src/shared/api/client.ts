// API bilan ishlash. Access token faqat xotirada turadi, refresh token — HttpOnly cookie'da.
const BASE = '/api/v1'

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
let onSessionLost: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function onUnauthorized(handler: () => void) {
  onSessionLost = handler
}

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, data: unknown) {
    super(errorText(data) || `Xato ${status}`)
    this.status = status
    this.data = data
  }
}

export function errorText(data: unknown): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return data.map(errorText).filter(Boolean).join(' ')
  if (typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (record.detail) return errorText(record.detail)
    return Object.values(record).map(errorText).filter(Boolean).join(' ')
  }
  return String(data)
}

export async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh/`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return false
        const data = await res.json()
        setAccessToken(data.access)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

type Params = Record<string, string | number | boolean | null | undefined>

interface RequestOptions {
  method?: string
  body?: unknown
  form?: FormData
  params?: Params
  retry?: boolean
}

export function buildQuery(params?: Params) {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, params, retry = true } = options
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}${buildQuery(params)}`, {
    method,
    headers,
    credentials: 'include',
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  if (res.status === 401 && retry) {
    if (await refreshSession()) return api<T>(path, { ...options, retry: false })
    onSessionLost?.()
  }
  if (res.status === 204) return undefined as T
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export const get = <T>(path: string, params?: Params) => api<T>(path, { params })
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body })
export const upload = <T>(path: string, form: FormData) => api<T>(path, { method: 'POST', form })
