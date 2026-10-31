from django.conf import settings
from django.db import models
from django.db.models import Q


class Notification(models.Model):
    # user bo'sh bo'lsa, xabar faqat Telegram guruhiga ketadi (chat_id).
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
                             related_name="notifications")
    chat_id = models.BigIntegerField(null=True, blank=True)
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    payload = models.JSONField(default=dict, blank=True, help_text="Bot tugmalari uchun: masalan {'item_id': 5}")
    dedupe_key = models.CharField(max_length=120, blank=True, help_text="Bir eslatma ikki marta yuborilmasligi uchun")
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    telegram_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read_at"])]
        constraints = [
            models.UniqueConstraint(fields=["user", "dedupe_key"], condition=~Q(dedupe_key=""),
                                    name="uniq_notification_dedupe"),
        ]
