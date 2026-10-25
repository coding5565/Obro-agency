import calendar
from datetime import date

from django.utils import timezone
from rest_framework.exceptions import ValidationError


def parse_month(value: str | None) -> tuple[int, int]:
    """«2026-11» → (2026, 11). Bo'sh bo'lsa joriy oy."""
    if not value:
        today = timezone.localdate()
        return today.year, today.month
    try:
        year, month = (int(part) for part in value.split("-"))
        date(year, month, 1)
    except (ValueError, TypeError):
        raise ValidationError({"month": "Oy formati: YYYY-MM"}) from None
    return year, month


def month_range(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
