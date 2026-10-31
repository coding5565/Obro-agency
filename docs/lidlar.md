# Lidlar, TZ va syomka

## Lid CRM'ga qanday tushadi

Har bir forma yoki sayt uchun **Lidlar → Manbalar → Manba qo‘shish** orqali alohida manba oching.
Manba maxfiy manzil beradi:

```
POST https://<panel-domeni>/api/v1/leads/hook/<token>/
```

Tizim JSON yoki oddiy forma yuborishi mumkin. Maydon nomlari qat’iy emas: `name`, `ism`, `fio`, `phone`,
`telefon`, `tel`, `Meta field_data` va ichma-ich obyektlar o‘zi taniladi. Tanilmagan ma’lumot ham yo‘qolmaydi:
xom holda saqlanadi va lid oynasida «Xom ma’lumot» bo‘limida ko‘rinadi.

Manzil tokeni parol bilan teng. Oshkor bo‘lsa, manbani o‘chirib yangisini oching.

### Yuboraman.uz

1. Yuboraman.uz’da Facebook/Instagram formangizni ulang.
2. Qabul qiluvchilar qatoriga o‘z API manzilingizni qo‘shing va panel bergan manzilni kiriting.
3. Formadan sinov lidi yuboring. Lid «Lidlar» ro‘yxatida paydo bo‘lishi kerak.

Yuboraman’ning aniq so‘rov formati ochiq e’lon qilinmagan, shuning uchun qabul qilish moslashuvchan yozilgan.
Birinchi haqiqiy lidni tekshirib, «Xom ma’lumot»ni ko‘zdan kechiring. Ism yoki telefon tanilmasa, nomini
`backend/common/calc/leads.py` dagi `ALIASES` ga qo‘shing.

**HTTPS:** ko‘p tizimlar faqat `https://` manzilni qabul qiladi. IP manzildagi sinov serveri rad etilishi mumkin,
buning uchun panelga domen va sertifikat ulang. Facebook’ga to‘g‘ridan-to‘g‘ri ulash uchun bundan tashqari
Meta ilovasi va uning tekshiruvi kerak; Yuboraman bu bosqichni olib tashlaydi.

### Xavfsizlik va qoidalar

- Bir manbadan bir lid qayta yuborilsa (`id`, `leadgen_id`), ikkinchi marta yozilmaydi.
- 30 kun ichida shu telefondan kelgan lid «Takror» deb belgilanadi va mas’ul o‘zgarmaydi. Takror va spam hisobotga kirmaydi.
- Mijoz faqat o‘z lidlarini ko‘radi, xom ma’lumotni ko‘rmaydi. Ijodkorlarga lidlar yopiq.
- Lid — shaxsiy ma’lumot (ism, telefon). Mijoz bilan shartnomada va formadagi roziligida bu qayd etilgan bo‘lishi kerak.
- Mijoz kabinetida lidlar tarifdagi «Lidlar ro‘yxati» bo‘limi yoqilganda ko‘rinadi (Standard va Premium). Tariflar sahifasida o‘zgartiriladi.

## TZ

SMM menejer yozadi → ijodkorga xabar boradi → ijodkor qabul qiladi, kadrlarni belgilaydi va topshiradi →
menejer qabul qiladi yoki izoh bilan qaytaradi. Qabul qilinganda shu kontent bo‘yicha ijodkorning vazifasi
yopiladi va ish jurnaliga yoziladi. TZ mijozga ko‘rinmaydi.

## Syomka

**Syomka** kalendarida syomkalar va TZ muddatlari birga ko‘rinadi. Bir odam bir vaqtda ikki syomkaga
qo‘yilsa, ogohlantirish chiqadi (saqlash taqiqlanmaydi). Mijoz «Syomka kunlari» bo‘limida vaqtni va nima
tayyorlashni ko‘rib tasdiqlaydi. Vaqt yoki joy o‘zgarsa, tasdiq qaytadan so‘raladi.

## Ogohlantirishlar

`python manage.py run_reminders` har 5 daqiqada ishlaydi (serverda `obro-panel-reminders.timer`). Xabar panelda
chiqadi, Telegram ulangan bo‘lsa bot ham yuboradi. Bir xabar ikki marta bormaydi.

| Nima | Qachon | Kimga |
|---|---|---|
| Syomka yaqin | 24 soat va 2 soat oldin | Ishtirokchilar, SMM, mijoz |
| Mijoz syomkani tasdiqlamagan | 24 soat qolganda | SMM |
| TZ ochilmagan | Yuborilgandan 2 soat keyin | Ijodkor |
| TZ muddati yaqin | 24 soat oldin | Ijodkor |
| TZ muddati o‘tgan | Har kuni | Ijodkor, SMM |
| Lidga javob yo‘q | 15 daqiqa (`LEAD_SLA_MINUTES`) | Mas’ul, SMM |
| Lidga hali javob yo‘q | 1 soat (`LEAD_ESCALATE_MINUTES`) | Rahbar |
| Lid bilan qayta bog‘lanish | Belgilangan vaqtda | Mas’ul |
| Kechagi lidlar hisoboti | Har kuni 09:00 dan | SMM, mijoz |
| Ertalabki xulosa | Har kuni 09:00 dan | Rahbar |
| Bugungi kurs kiritilmagan | Har kuni 10:00 dan | Rahbar |
| Ish jurnali bo‘sh | Har kuni 18:30 dan | Jamoa |

Javobsiz lid eslatmalari 22:00–08:00 oralig‘ida yuborilmaydi.

## Moliya

Moliya bo‘limi: hisob-fakturalar, to‘lovlar, xarajatlar, qarzdorlar, hisoblar, foyda va hisobot, sheriklar, kurs, sozlamalar.

- **Sof foyda** = tushum − reklama budjeti − jamoa ulushi (bonus, dona ish va jarima bilan) − tasdiqlangan xarajatlar. Avans va sherik olgan pul foydani kamaytirmaydi, ular faqat kassadan chiqadi.
- **Hisob qoldig‘i** yozuvlardan hisoblanadi: boshlang‘ich qoldiq + kirim − chiqim. Hisob qoldig‘i to‘g‘ri chiqishi uchun to‘lov va xarajatda hisobni tanlash kerak.

## Harakatlar va Versiyalar

- **Harakatlar** (`/app/activity`, rahbar va super admin): tizimga kirish va har bir o‘zgartirish yoziladi. So‘rov tanasi saqlanmaydi, shuning uchun parol jurnalga tushmaydi.
- **Versiyalar** (`/app/versions`): har yangilanishda `frontend/src/shared/changelog.ts` ga yangi yozuv qo‘shiladi.
