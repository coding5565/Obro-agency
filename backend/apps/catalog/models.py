from django.db import models

from common.money import CURRENCY_CHOICES, MONEY_DIGITS, MONEY_PLACES, USD

POST = "post"
REELS = "reels"
STORIES = "stories"
VIDEO = "video"
CONTENT_KIND_CHOICES = [(POST, "Post"), (REELS, "Reels"), (STORIES, "Stories"), (VIDEO, "Video")]

# Mijoz panelidagi bo'limlar. Tarif versiyasida qaysilari ochiq ekani saqlanadi.
PANEL_FEATURES = {
    "dashboard": "Bosh sahifa",
    "calendar": "Kontent kalendari",
    "approvals": "Materiallarni tasdiqlash",
    "monthly_report": "Oylik hisobot",
    "invoices": "To‘lovlar",
    "worklog": "Kunlik ish jurnali",
    "metrics": "Ko‘rsatkichlar",
    "ads": "Reklama natijalari",
    "leads": "Lidlar ro‘yxati",
    "weekly_review": "Haftalik tahlil izohi",
    "requests": "So‘rov yuborish",
}
BASIC_FEATURES = ["dashboard", "calendar", "approvals", "monthly_report", "invoices", "requests"]
FULL_FEATURES = BASIC_FEATURES + ["worklog", "metrics", "ads", "leads"]


class Tariff(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=255, blank=True)
    sort = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort", "name"]

    def __str__(self):
        return self.name

    def current_version(self, on=None):
        from django.utils import timezone

        on = on or timezone.localdate()
        return self.versions.filter(valid_from__lte=on).order_by("-valid_from").first()


class TariffVersion(models.Model):
    """Tarif narxi va tarkibi. Narx o'zgarsa yangi versiya qo'shiladi, eski loyihalar eskisida qoladi."""

    tariff = models.ForeignKey(Tariff, on_delete=models.PROTECT, related_name="versions")
    price = models.DecimalField(max_digits=MONEY_DIGITS, decimal_places=MONEY_PLACES)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    valid_from = models.DateField()
    revisions_per_item = models.PositiveSmallIntegerField(default=2, help_text="Bitta kontentga tuzatishlar soni")
    panel_features = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["tariff__sort", "-valid_from"]
        unique_together = [("tariff", "valid_from")]

    def __str__(self):
        return f"{self.tariff.name} · {self.price} {self.currency} ({self.valid_from:%d.%m.%Y})"

    def limit_map(self) -> dict:
        return {limit.content_kind: limit.quantity for limit in self.limits.all()}


class TariffLimit(models.Model):
    version = models.ForeignKey(TariffVersion, on_delete=models.CASCADE, related_name="limits")
    content_kind = models.CharField(max_length=10, choices=CONTENT_KIND_CHOICES)
    quantity = models.PositiveSmallIntegerField()

    class Meta:
        unique_together = [("version", "content_kind")]


class Service(models.Model):
    """Qo'shimcha xizmat: suratga olish, brendfeys, lokatsiya va boshqalar."""

    UNIT_CHOICES = [("hour", "soat"), ("video", "video"), ("day", "kun"), ("piece", "dona"), ("month", "oy")]

    name = models.CharField(max_length=120)
    unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default="piece")
    price = models.DecimalField(max_digits=MONEY_DIGITS, decimal_places=MONEY_PLACES, null=True, blank=True)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    price_negotiable = models.BooleanField(default=True, help_text="Narx har safar kelishiladi")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
