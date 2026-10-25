from django.conf import settings
from django.db import models

KIND_CHOICES = [
    ("shooting", "Suratga olish"),
    ("editing", "Montaj"),
    ("design", "Dizayn"),
    ("publishing", "Joylash"),
    ("stories", "Stories"),
    ("target", "Target reklama"),
    ("script", "Ssenariy / matn"),
    ("report", "Hisobot / tahlil"),
    ("meeting", "Uchrashuv"),
    ("other", "Boshqa"),
]

SOURCE_AUTO = "auto"
SOURCE_MANUAL = "manual"
SOURCE_BOT = "bot"

SUBMITTED = "submitted"
APPROVED = "approved"
REJECTED = "rejected"


class WorkLogEntry(models.Model):
    """Kunlik ish jurnali yozuvi. Mijozga faqat tasdiqlangan va «mijozga ochiq» yozuvlar ko'rinadi."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="worklog")
    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="worklog")
    date = models.DateField()
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default="other")
    quantity = models.PositiveSmallIntegerField(default=1)
    title = models.CharField("Nima qilindi", max_length=255)
    link = models.URLField(blank=True)
    internal_note = models.TextField(blank=True)
    source = models.CharField(max_length=6, choices=[(SOURCE_AUTO, "Avto"), (SOURCE_MANUAL, "Qo‘lda"),
                                                     (SOURCE_BOT, "Bot")], default=SOURCE_MANUAL)
    status = models.CharField(max_length=10, choices=[(SUBMITTED, "Tekshiruvda"), (APPROVED, "Tasdiqlandi"),
                                                      (REJECTED, "Rad etildi")], default=SUBMITTED)
    client_visible = models.BooleanField(default=True, help_text="Tasdiqlangandan keyin mijozga ko'rinsinmi")
    content_item = models.ForeignKey("content.ContentItem", null=True, blank=True, on_delete=models.SET_NULL)
    task = models.ForeignKey("tasks.Task", null=True, blank=True, on_delete=models.SET_NULL)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["project", "date"])]
