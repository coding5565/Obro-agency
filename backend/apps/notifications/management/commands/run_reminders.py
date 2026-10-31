"""Syomka, TZ va lidlar bo'yicha ogohlantirishlar. Serverda systemd timer har 5 daqiqada ishga tushiradi."""
from django.core.management.base import BaseCommand

from apps.notifications.reminders import run_due


class Command(BaseCommand):
    help = "Muddati kelgan ogohlantirishlarni yuboradi"

    def handle(self, *args, **options):
        run_due()
