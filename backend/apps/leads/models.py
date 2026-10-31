import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q

from common.money import CURRENCY_CHOICES, MONEY_DIGITS, MONEY_PLACES, UZS

NEW = "new"
CONTACTED = "contacted"
QUALIFIED = "qualified"
WON = "won"
LOST = "lost"
SPAM = "spam"
STATUS_CHOICES = [
    (NEW, "Yangi"),
    (CONTACTED, "Bog‘lanildi"),
    (QUALIFIED, "Qiziqdi"),
    (WON, "Sotildi"),
    (LOST, "Rad etdi"),
    (SPAM, "Spam"),
]
# Javob kutilmaydigan holatlar: ularga eslatma yuborilmaydi.
CLOSED = {WON, LOST, SPAM}

KIND_CHOICES = [
    ("yuboraman", "Yuboraman.uz"),
    ("meta", "Facebook / Instagram forma"),
    ("tilda", "Tilda / sayt formasi"),
    ("telegram", "Telegram bot"),
    ("other", "Boshqa tizim (webhook)"),
    ("manual", "Qo‘lda kiritish"),
]


def _token():
    return secrets.token_urlsafe(24)


class LeadSource(models.Model):
    """Lid manbasi: har biriga alohida maxfiy manzil (webhook). Yuboraman va boshqalar lidni shu yerga yuboradi."""

    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="lead_sources")
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default="yuboraman")
    token = models.CharField(max_length=64, unique=True, default=_token)
    is_active = models.BooleanField(default=True)
    default_assignee = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name="+")
    telegram_chat_id = models.BigIntegerField(null=True, blank=True, help_text="Lidlar yuboriladigan Telegram guruh")
    received_count = models.PositiveIntegerField(default=0)
    last_received_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class Lead(models.Model):
    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="leads")
    source = models.ForeignKey(LeadSource, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    source_label = models.CharField(max_length=120, blank=True)
    external_id = models.CharField(max_length=100, blank=True)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True, db_index=True)
    email = models.EmailField(blank=True)
    city = models.CharField(max_length=80, blank=True)
    message = models.TextField(blank=True)
    form_name = models.CharField(max_length=150, blank=True)
    campaign_name = models.CharField(max_length=150, blank=True)
    ad_name = models.CharField(max_length=150, blank=True)
    platform = models.CharField(max_length=40, blank=True)
    raw = models.JSONField(default=dict, blank=True, help_text="Kelgan xom ma'lumot (faqat jamoa uchun)")

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=NEW)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="assigned_leads")
    duplicate_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    first_response_at = models.DateTimeField(null=True, blank=True)
    next_contact_at = models.DateTimeField(null=True, blank=True)
    sale_amount = models.DecimalField(max_digits=MONEY_DIGITS, decimal_places=MONEY_PLACES, null=True, blank=True)
    sale_currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=UZS)
    lost_reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["project", "status"])]
        constraints = [
            # Tizim bir lidni qayta yuborsa (retry), ikkinchi marta yozilmaydi.
            models.UniqueConstraint(fields=["source", "external_id"], condition=~Q(external_id=""),
                                    name="uniq_lead_source_external"),
        ]

    def __str__(self):
        return self.full_name or self.phone or f"Lid #{self.pk}"

    @property
    def is_duplicate(self):
        return self.duplicate_of_id is not None


class LeadEvent(models.Model):
    """Lid tarixi: kim, qachon, nima qildi."""

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="events")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="+")
    kind = models.CharField(max_length=12, choices=[("created", "Keldi"), ("status", "Holat"), ("comment", "Izoh"),
                                                    ("assigned", "Mas’ul"), ("reminder", "Eslatma")])
    text = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
