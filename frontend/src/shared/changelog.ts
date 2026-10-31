// Versiyalar tarixi. Har yangilanishda eng yuqoriga yangi yozuv qo'shiladi: oddiy tilda, nima o'zgargani.
export interface Release {
  version: string
  date: string
  title: string
  changes: { area: string; items: string[] }[]
}

export const RELEASES: Release[] = [
  {
    version: '1.5',
    date: '2026-10-31',
    title: 'To‘liq moliya, Harakatlar va Versiyalar',
    changes: [
      { area: 'Hisoblar', items: ['Har bir kassa va karta qoldig‘i o‘zi hisoblanadi', 'Oylik ko‘chirma: nima kirdi, nima chiqdi', 'Hisoblar orasida o‘tkazma, dollar almashtirish ham'] },
      { area: 'Foyda va hisobot', items: ['Bonus, dona ish va jarima endi sof foydaga ta’sir qiladi (oldin hisobga kirmas edi)', 'Pul oqimi: haqiqatda kirgan va chiqqan pul', 'Har bir mijoz qancha foyda keltirgani', '12 oylik foyda grafigi va CSV yuklab olish', 'Yopilgan oyni super admin qayta ocha oladi'] },
      { area: 'Sheriklar', items: ['Sheriklar va ulush foizini o‘zingiz kiritasiz (oldin foyda doim ikkiga bo‘linardi)', 'Sherik olgan pul alohida yoziladi'] },
      { area: 'Xarajatlar', items: ['Xarajatni bekor qilish, chek biriktirish, mijozga bog‘lash', 'Oy, holat va kategoriya bo‘yicha filtr', 'Takroriy xarajatlar (ijara, servis) o‘zi yoziladi', 'Xodim «Mening hisobim» bo‘limidan xarajat so‘rovi yubora oladi'] },
      { area: 'To‘lov va qarz', items: ['Hisob-fakturasiz to‘lov va avansni taqsimlash', 'Hisob-fakturaga qo‘shimcha xizmat qatori qo‘shish', 'Qarzdorlar ro‘yxati va bir tugma bilan eslatma', 'To‘lov muddati yaqinlashsa yoki o‘tsa, o‘zi ogohlantiradi'] },
      { area: 'Maosh', items: ['To‘langan maoshlar tarixi va xato to‘lovni bekor qilish', 'Qoldiqdan ko‘p to‘lab bo‘lmaydi', 'To‘lov sanasi va qaysi hisobdan berilgani yoziladi', 'Vedomost tasdiqlanmasa, 5-sanada eslatadi'] },
      { area: 'Harakatlar', items: ['Kim, qachon, nima qilgani bitta joyda', 'Bo‘lim, odam va sana bo‘yicha filtr'] },
      { area: 'Versiyalar', items: ['Shu sahifa: har yangilanishda nima o‘zgargani'] },
    ],
  },
  {
    version: '1.4',
    date: '2026-10-31',
    title: 'Landing page',
    changes: [
      { area: 'Sayt', items: ['Agentlik sayti: tariflar, oy taqvimi, CRM namunasi, aloqa', 'Telefonda doim ko‘rinadigan qo‘ng‘iroq va Telegram tugmalari'] },
      { area: 'Kirish', items: ['Mijozlar sayt burchagidagi Login orqali kiradi', 'Jamoa uchun alohida /jamoa sahifasi'] },
    ],
  },
  {
    version: '1.3',
    date: '2026-10-31',
    title: 'Lidlar, TZ va syomka',
    changes: [
      { area: 'Lidlar', items: ['Yuboraman, sayt va formalardan lid CRM’ga o‘zi tushadi', 'Takror va spam hisobotga kirmaydi', 'Javobsiz lid haqida 15 daqiqada, 1 soatda rahbarga ogohlantirish'] },
      { area: 'TZ', items: ['SMM ijodkorga TZ yozadi, ijodkor qabul qilib topshiradi', 'Kadrlar ro‘yxati va muddat eslatmalari'] },
      { area: 'Syomka', items: ['Syomka kalendari va bandlik to‘qnashuvi haqida ogohlantirish', 'Mijoz syomkani kabinetdan tasdiqlaydi'] },
    ],
  },
  {
    version: '1.2',
    date: '2026-10-25',
    title: 'Serverga chiqdi',
    changes: [{ area: 'Server', items: ['Panel serverda ishga tushdi', 'Har bir rol uchun sinov akkauntlari'] }],
  },
  {
    version: '1.1',
    date: '2026-10-25',
    title: 'Telegram bot va kurs',
    changes: [{ area: 'Bot', items: ['Bildirishnomalar, vazifalar, ish jurnali va tasdiqlash botda', 'Dollar kursi Markaziy bankdan o‘zi olinadi'] }],
  },
  {
    version: '1.0',
    date: '2026-10-25',
    title: 'Birinchi versiya',
    changes: [{ area: 'Panel', items: ['Mijozlar, kontent reja, vazifalar, ish jurnali', 'Hisob-faktura, to‘lov, foizli maosh', 'Mijoz kabineti'] }],
  },
]

export const LATEST_VERSION = RELEASES[0].version
export const SEEN_KEY = 'obro-seen-version'

export function hasUnseenRelease() {
  try {
    return window.localStorage.getItem(SEEN_KEY) !== LATEST_VERSION
  } catch {
    return false
  }
}

export function markReleaseSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, LATEST_VERSION)
  } catch {
    // Brauzer xotirasi yopiq bo'lsa ham sahifa ishlayveradi.
  }
}
