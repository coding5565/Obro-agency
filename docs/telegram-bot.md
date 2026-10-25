# Telegram bot — sozlash va ishlatish

Bot OBRO’ Panel’dagi bildirishnomalarni Telegram’ga yuboradi va oddiy ishlarni chatning o‘zida qilishga imkon beradi.
Bot bazaga kirmaydi: hamma narsa backend API orqali (`/api/v1/bot/…`, maxfiy kalit bilan) o‘tadi.

## Bir martalik sozlash

1. Telegram’da **@BotFather** → `/newbot`.
   - Nomi: `OBRO’ Panel`.
   - Username: masalan `obro_panel_bot` — oxiri `bot` bilan tugashi shart.
2. BotFather bergan **tokenni** `bot/.env` faylidagi `TELEGRAM_BOT_TOKEN=` qatoriga yozing.
3. Botning username’ini (`@` belgisisiz) `backend/.env` faylidagi `TELEGRAM_BOT_USERNAME=` qatoriga yozing.
4. Maxfiy kalit (`TELEGRAM_BOT_API_SECRET`) ikkala `.env` faylda allaqachon bir xil. Uni o‘zgartirmang.
   Agar o‘zgartirsangiz, ikkala faylda ham bir xil bo‘lishi kerak.
5. Ixtiyoriy: BotFather’da `/setuserpic` buyrug‘i bilan bot rasmini qo‘ying (`docs/brand/obro-ilova-belgisi.svg` asosida).

Token — maxfiy. Uni hech kimga yubormang va GitHub’ga yuklamang (`.env` fayllar `.gitignore`da).

## Ishga tushirish

Avval baza va backend ishlab turishi kerak (README’ga qarang). Keyin alohida oynada:

```powershell
cd bot
.venv\Scripts\python.exe -m obro_bot
```

Backend’dan keyin `backend/.env` o‘zgarsa, backend serverini qayta ishga tushiring.

## Foydalanuvchi qanday ulanadi

Panelda chap pastdagi ism → **Profil** → **«Telegram’ni ulash»** → Telegram ochiladi → **Start**.
Havola 15 daqiqa amal qiladi va faqat bir marta ishlaydi.

## Bot nima qiladi

| Kim | Imkoniyat |
| --- | --- |
| Hamma | Paneldagi bildirishnomalar Telegram’ga keladi (har 10 soniyada tekshiriladi) |
| Mijoz | «Tasdiqlash kutmoqda» xabaridagi **✅ Tasdiqlayman** yoki **✍️ Izoh qoldirish** tugmasi |
| Jamoa | `/bugun` — vazifalar, bitta tugma bilan «bajarildi» (jurnalga o‘zi yoziladi) |
| Jamoa | `/jurnal` — mijoz → ish turi → bir gap; SMM tasdiqlagach mijozga ko‘rinadi |
| Rahbar | Har kuni 09:00 da xulosa: qarzlar, mijoz tasdig‘idagi ishlar, muddati o‘tgan vazifalar |
| Jamoa | 18:30 da, agar bugun jurnal bo‘sh bo‘lsa, eslatma |
| Tizim | Har kuni 09:00 da Markaziy bank (cbu.uz) dollar kursi olinadi |

Vaqtlarni `bot/.env` dagi `MORNING_AT` va `EVENING_AT` qatorlarida o‘zgartirish mumkin.

## Serverda

Bot long polling bilan ishlaydi: tashqi manzil yoki webhook kerak emas. Uni xizmat sifatida yurgizing (Windows Task Scheduler,
`nssm` yoki Linux’da `systemd`). Panel `https://` manzilda bo‘lsa, xabarlarda «Panelda ochish» tugmasi ham chiqadi
(`backend/.env` → `FRONTEND_URL`).
