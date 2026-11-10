// Telefonga ilova qilib o'rnatish. Android/Chrome o'z oynasini beradi; iPhone'da faqat «Ulashish → Bosh ekranga
// qo'shish» orqali bo'ladi, shuning uchun u yerda yo'riqnoma ko'rsatiladi.
import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const CHANGE = 'obro-install-change'

function notify() {
  window.dispatchEvent(new Event(CHANGE))
}

// Hodisa sahifa yuklanishi bilan keladi, tugma hali chizilmagan bo'lishi mumkin: shuning uchun darhol ushlanadi.
export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    })
  }
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIos() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual'

function currentMode(): InstallMode {
  if (isStandalone()) return 'installed'
  if (deferred) return 'prompt'
  return isIos() ? 'ios' : 'manual'
}

export function useInstall() {
  const [mode, setMode] = useState<InstallMode>(currentMode)
  useEffect(() => {
    const update = () => setMode(currentMode())
    window.addEventListener(CHANGE, update)
    return () => window.removeEventListener(CHANGE, update)
  }, [])
  async function prompt() {
    if (!deferred) return false
    const event = deferred
    await event.prompt()
    const choice = await event.userChoice
    deferred = null
    notify()
    return choice.outcome === 'accepted'
  }
  return { mode, prompt }
}
