from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """O'zgarmas audit jurnali: pul, ruxsat, tasdiq va maosh qoidasi o'zgarishlari."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=40)
    entity_type = models.CharField(max_length=60)
    entity_id = models.CharField(max_length=40)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    comment = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["entity_type", "entity_id"])]

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Audit yozuvini o'zgartirib bo'lmaydi")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Audit yozuvini o'chirib bo'lmaydi")
