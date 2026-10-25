"""Markaziy bank (cbu.uz) kursini olish. Kalit kerak emas.

API: https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/2026-10-24/ →
[{"Ccy": "USD", "Nominal": "1", "Rate": "11838.92", "Date": "24.10.2026", ...}]
"""
import json
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.conf import settings

from apps.finance.models import ExchangeRate

log = logging.getLogger(__name__)

CBU_URL = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/{currency}/{day}/"


class RateFetchError(Exception):
    pass


def parse_cbu(payload, currency):
    """CBU javobidan 1 birlik valyutaning so'mdagi kursini oladi."""
    try:
        row = next(item for item in payload if item.get("Ccy") == currency)
        rate = Decimal(str(row["Rate"])) / Decimal(str(row.get("Nominal") or "1"))
    except (StopIteration, KeyError, TypeError, InvalidOperation) as exc:
        raise RateFetchError(f"CBU javobida {currency} kursi topilmadi") from exc
    if rate <= 0:
        raise RateFetchError("CBU kursi noto‘g‘ri")
    return rate.quantize(Decimal("0.0001"))


def fetch_cbu_rate(currency: str, day: date, timeout=None) -> Decimal:
    url = CBU_URL.format(currency=currency, day=day.isoformat())
    request = Request(url, headers={"User-Agent": "OBRO-Panel/1.0", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout or settings.CBU_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        raise RateFetchError(f"cbu.uz bilan bog‘lanib bo‘lmadi: {exc}") from exc
    return parse_cbu(payload, currency)


def store_cbu_rate(currency: str, day: date) -> ExchangeRate:
    """Kursni olib, bazaga yozadi. Shu kun uchun qo'lda kiritilgan kurs bo'lsa, unga tegmaydi."""
    existing = ExchangeRate.objects.filter(currency=currency, date=day).first()
    if existing:
        return existing
    rate = fetch_cbu_rate(currency, day)
    return ExchangeRate.objects.create(currency=currency, date=day, rate_to_uzs=rate, source="cbu")


def rate_for_day(currency: str, day: date):
    """Shu kun kursi: avval bazadan, bo'lmasa cbu.uz'dan, u ham bo'lmasa oxirgi ma'lum kurs."""
    exact = ExchangeRate.objects.filter(currency=currency, date=day).first()
    if exact:
        return exact.rate_to_uzs
    if settings.CBU_AUTO_FETCH:
        try:
            return store_cbu_rate(currency, day).rate_to_uzs
        except RateFetchError as exc:
            log.warning("CBU kursi olinmadi: %s", exc)
    return ExchangeRate.rate_on(currency, day)
