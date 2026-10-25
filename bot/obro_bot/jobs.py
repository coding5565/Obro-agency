"""Fon ishlari: bildirishnomalarni yuborish va kunlik rejali ishlar (kurs, ertalabki xulosa, kechki eslatma)."""
import asyncio
import logging
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError, TelegramRetryAfter

from obro_bot.api import Api, ApiError
from obro_bot.keyboards import from_spec

log = logging.getLogger("obro_bot.jobs")


async def send_one(bot: Bot, row: dict) -> bool:
    """Bitta xabarni yuboradi. True — navbatdan olib tashlash mumkin (yuborildi yoki yuborib bo'lmaydi)."""
    try:
        await bot.send_message(row["chat_id"], row["text"], reply_markup=from_spec(row.get("buttons")))
        return True
    except TelegramRetryAfter as exc:
        await asyncio.sleep(exc.retry_after)
        return False
    except TelegramForbiddenError:
        log.info("Foydalanuvchi botni bloklagan: chat %s", row["chat_id"])
        return True
    except TelegramBadRequest as exc:
        # Ko'pincha sabab — tugmadagi manzil. Tugmalarsiz (faqat callback bilan) qayta urinamiz.
        log.warning("Xabar yuborilmadi (%s), tugmasiz qayta urinilmoqda", exc)
        try:
            markup = from_spec(row.get("buttons"), with_urls=False)
            await bot.send_message(row["chat_id"], row["text"], reply_markup=markup)
        except TelegramBadRequest:
            log.exception("Xabar baribir yuborilmadi: %s", row["id"])
        return True


async def outbox_loop(bot: Bot, api: Api, interval: int):
    while True:
        try:
            rows = await api.outbox()
            done = [row["id"] for row in rows if await send_one(bot, row)]
            if done:
                await api.ack(done)
        except (ApiError, OSError) as exc:
            log.warning("Navbatni o'qib bo'lmadi: %s", exc)
        except Exception:  # noqa: BLE001 — fon sikli to'xtab qolmasligi kerak
            log.exception("Kutilmagan xato navbatda")
        await asyncio.sleep(interval)


def due(now: datetime, at: time, last_run: date | None) -> bool:
    """Bugun belgilangan vaqtdan o'tdik va bugun hali ishga tushmagan bo'lsa — True."""
    return now.time() >= at and last_run != now.date()


async def schedule_loop(api: Api, morning_at: time, evening_at: time, tz: str):
    zone = ZoneInfo(tz)
    last = {"morning": None, "evening": None}
    # Bot kechroq yoqilsa, o'tib ketgan ishni shu kuni bajarmaymiz
    # (masalan, 23:00 da yoqilsa ertalabki xulosa kerak emas).
    now = datetime.now(zone)
    for name, at in (("morning", morning_at), ("evening", evening_at)):
        if now.time() >= at:
            last[name] = now.date()
    while True:
        now = datetime.now(zone)
        try:
            if due(now, morning_at, last["morning"]):
                last["morning"] = now.date()
                result = await api.daily_job()
                log.info("Ertalabki ish: %s", result)
            if due(now, evening_at, last["evening"]):
                last["evening"] = now.date()
                result = await api.evening_job()
                log.info("Kechki eslatma: %s", result)
        except (ApiError, OSError) as exc:
            log.warning("Rejali ish bajarilmadi: %s", exc)
        await asyncio.sleep(30)
