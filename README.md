# Obro agenstva — OBRO’ Panel (CRM va mijoz paneli)

OBRO Agency uchun CRM va mijoz kabineti. Frontend — React, backend — Django REST Framework, baza — PostgreSQL.

- `OBRO_Panel_CRM_reja.pdf` — to‘liq reja (22 bet). Manbasi `docs/reja/`.
- `docs/brand/` — logo (slayddagi nishon + «OBRO AGENCY», yozuvi vektorga aylantirilgan SVG).
- `docs/openapi.yml` — API hujjati (server ishlaganda: http://127.0.0.1:8000/api/docs/).

## Ishga tushirish (Windows)

1. Bazani yoqish (loyiha ichidagi PostgreSQL 17, 5433-port; asosiy Postgres xizmatiga tegmaydi):

```powershell
powershell -File scripts\db.ps1 start
```

2. Backend:

```powershell
cd backend
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

3. Frontend (boshqa oynada):

```powershell
cd frontend
npm run dev
```

Brauzerda: http://127.0.0.1:5173

4. Telegram bot (ixtiyoriy, token kerak — `docs/telegram-bot.md`):

```powershell
cd bot
.venv\Scripts\python.exe -m obro_bot
```

Dollar kursi: to‘lov kiritilganda kun kursi bazada bo‘lmasa, cbu.uz’dan o‘zi olinadi. Qo‘lda olish: `manage.py fetch_rates` yoki panel → Moliya → Kurs → «cbu.uz’dan olish».

Birinchi marta, bo‘sh bazada: `manage.py seed_obro` (tariflar, lavozimlar, foiz qoidalari) yoki `seed_obro --demo` (+ sinov akkauntlari).

### Demo akkauntlar (faqat lokal sinov uchun)

Telefonlar `+998900000001` … `+998900000006`: super admin, rahbar, SMM menejer, videograf, dizayner, mijoz egasi.
Parol — `backend/apps/core/management/commands/seed_obro.py` dagi `DEMO_PASSWORD_DEFAULT` (yoki `DEMO_PASSWORD` muhit o‘zgaruvchisi).
Serverda `--demo` ishlatilmaydi.

## Lidlar, TZ, syomka

Lid qabul qilish (Yuboraman, sayt), TZ oqimi, syomka kalendari va ogohlantirishlar: `docs/lidlar.md`.
Ogohlantirishlar uchun `python manage.py run_reminders` har 5 daqiqada ishga tushishi kerak.

## Testlar

```powershell
cd backend
.venv\Scripts\python.exe -m pytest
```

PostgreSQL’da sinash: `TEST_DATABASE_URL` berilsa, testlar alohida `test_…` bazada yuradi.

## Tuzilma

```
backend/
  config/            sozlamalar (base / dev / prod / test), URL’lar
  apps/accounts      foydalanuvchi, rol, lavozim, taklif havolasi
  apps/catalog       tariflar (versiyali narx), xizmatlar
  apps/clients       mijoz, loyiha, jamoa biriktirish
  apps/content       kontent kalendari, versiya, mijoz tasdig‘i, suratga olish
  apps/tasks         vazifalar
  apps/worklog       kunlik ish jurnali
  apps/metrics       ko‘rsatkichlar, reklama
  apps/finance       hisob-faktura, to‘lov, xarajat, kurs, oylik foyda
  apps/payroll       foizli maosh: qoida, hisoblanma, vedomost
  apps/portal        mijoz kabineti API (faqat ruxsat etilgan maydonlar)
  apps/core          audit jurnali, bosh ekran, seed buyrug‘i
  apps/telegram      bot uchun API: ulash, xabarlar navbati, buyruqlar, rejali ishlar
  common/calc        pul hisob-kitobi (sof funksiyalar, testlangan)
bot/obro_bot/        Telegram bot (aiogram 3): bildirishnomalar, /bugun, /jurnal, tasdiqlash tugmalari
frontend/src/
  layouts/           jamoa va mijoz qobig‘i
  pages/team         jamoa sahifalari
  pages/portal       mijoz kabineti
  shared/            API mijoz, tiplar, UI komponentlar, logo
scripts/db.ps1       lokal PostgreSQL’ni yoqish / o‘chirish
```

## Qabul qilingan standart qarorlar (o‘zgartirish mumkin)

Rejadagi ochiq savollarga javob kelmagani uchun tavsiya qilingan variantlar olindi:

- Maosh foizi mijoz **haqiqatda to‘lagan** summadan, to‘lov kuni hisoblanadi.
- Dollar to‘lovda kurs to‘lov kuni qotiriladi, xodim ulushi shu kurs bilan so‘mga o‘giriladi.
- Foizlar: SMM + target 20%, videograf-mobilograf 12,5%, dizayner-montajyor 12,5%. Bir lavozimda ikki kishi bo‘lsa, foiz teng bo‘linadi yoki loyihada qo‘lda beriladi.
- Brendfeys va frilanser haqi jamoaning 45% idan emas («Dona ish» tuzatishi bilan yoziladi).
- Hisob-faktura oldindan, loyiha boshlangan sana bo‘yicha har oy; to‘lov muddati 5 kun.
- Reklama budjeti mijozdan Meta’ga to‘g‘ridan-to‘g‘ri; agentlik orqali o‘tsa «tranzit» qatori (foyda va maoshga kirmaydi).
- Basic panelda: bosh sahifa, kalendar, tasdiqlash, oylik hisobot, to‘lovlar, so‘rov. Standard/Premium’da + ish jurnali, ko‘rsatkichlar, reklama.
- Lidlar MVP’da faqat soni bilan.
- Tuzatishlar soni har tarifda 2 (tarif sozlamasidan o‘zgaradi).
