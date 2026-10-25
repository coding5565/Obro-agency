"""Bugungi (yoki berilgan kundagi) dollar kursini cbu.uz'dan olib saqlaydi.

    python manage.py fetch_rates
    python manage.py fetch_rates --date 2026-10-24
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.finance.rates import RateFetchError, store_cbu_rate


class Command(BaseCommand):
    help = "Markaziy bank kursini olib saqlaydi"

    def add_arguments(self, parser):
        parser.add_argument("--date", type=date.fromisoformat, default=None)
        parser.add_argument("--currency", default="USD")

    def handle(self, *args, **options):
        day = options["date"] or timezone.localdate()
        try:
            rate = store_cbu_rate(options["currency"], day)
        except RateFetchError as exc:
            raise CommandError(str(exc)) from exc
        line = f"{day:%d.%m.%Y}: 1 {rate.currency} = {rate.rate_to_uzs} so‘m ({rate.source})"
        self.stdout.write(self.style.SUCCESS(line))
