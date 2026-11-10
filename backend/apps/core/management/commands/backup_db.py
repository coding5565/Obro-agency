"""Kunlik zaxira nusxa. Serverda systemd timer har kuni 21:00 (Toshkent) da ishga tushiradi."""
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.core.backup import BackupError, run
from apps.notifications.services import notify
from common import access


class Command(BaseCommand):
    help = "Baza va fayllar nusxasini olib, Telegram'ga yuboradi"

    def handle(self, *args, **options):
        try:
            result = run()
        except BackupError as exc:
            admins = User.objects.filter(role=access.SUPER_ADMIN, is_active=True)
            notify(admins, "backup.failed", "Baza nusxasi olinmadi", body=str(exc), link="/app")
            raise CommandError(str(exc)) from None
        for line in [*result["files"], *result["sent"]]:
            self.stdout.write(line)
