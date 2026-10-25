import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def _token():
    # Telegram /start parametri: faqat A-Z a-z 0-9 _ - va 64 belgigacha.
    return secrets.token_urlsafe(24)


def _expiry():
    return timezone.now() + timedelta(minutes=settings.TELEGRAM_LINK_MINUTES)


class TelegramLinkToken(models.Model):
    """Panelda «Telegram'ni ulash» bosilganda yaratiladigan bir martalik havola."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="telegram_tokens")
    token = models.CharField(max_length=64, unique=True, default=_token)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=_expiry)
    used_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_usable(self):
        return self.used_at is None and self.expires_at > timezone.now()
