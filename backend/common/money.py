"""Pul bilan ishlash qoidalari: faqat Decimal, har summada valyuta, kurs to'lov kunida qotiriladi."""
from decimal import ROUND_HALF_UP, Decimal

UZS = "UZS"
USD = "USD"
CURRENCY_CHOICES = [(UZS, "so‘m"), (USD, "dollar")]

MONEY_DIGITS = 18
MONEY_PLACES = 2
RATE_PLACES = 4
CENT = Decimal("0.01")


def D(value) -> Decimal:
    """Har qanday qiymatni Decimal'ga o'giradi. float qabul qilinmaydi — u yaxlitlash xatosi beradi."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        raise TypeError("Pul uchun float ishlatilmaydi, str yoki Decimal bering")
    if value is None or value == "":
        return Decimal("0")
    return Decimal(str(value))


def q(value) -> Decimal:
    """Summani 2 xonagacha yaxlitlaydi (0,005 → 0,01)."""
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def to_uzs(amount, currency: str, rate_to_uzs) -> Decimal:
    """Summani so'mga o'giradi. So'mdagi summa uchun kurs 1."""
    if currency == UZS:
        return q(amount)
    rate = D(rate_to_uzs)
    if rate <= 0:
        raise ValueError(f"{currency} uchun kurs berilmagan")
    return q(D(amount) * rate)


def percent_of(amount, percent) -> Decimal:
    return q(D(amount) * D(percent) / Decimal("100"))
