from django.conf import settings
from django.db import models

from common.money import CURRENCY_CHOICES, MONEY_DIGITS, MONEY_PLACES, USD


class Client(models.Model):
    NICHE_CHOICES = [
        ("clinic", "Klinika"),
        ("education", "O‘quv markazi"),
        ("restaurant", "Restoran / kafe"),
        ("retail", "Savdo"),
        ("beauty", "Go‘zallik"),
        ("other", "Boshqa"),
    ]
    STATUS_CHOICES = [
        ("lead", "Potensial"),
        ("active", "Faol"),
        ("paused", "To‘xtatilgan"),
        ("churned", "Ketgan"),
    ]

    name = models.CharField("Nomi", max_length=150)
    niche = models.CharField(max_length=20, choices=NICHE_CHOICES, default="other")
    city = models.CharField(max_length=80, default="Farg‘ona")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="lead")
    source = models.CharField("Qayerdan keldi", max_length=120, blank=True)
    notes = models.TextField("Ichki izoh", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ClientContact(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="contacts")
    full_name = models.CharField(max_length=150)
    position = models.CharField(max_length=80, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_primary", "full_name"]


class SocialAccount(models.Model):
    PLATFORM_CHOICES = [
        ("instagram", "Instagram"),
        ("telegram", "Telegram"),
        ("tiktok", "TikTok"),
        ("youtube", "YouTube"),
        ("facebook", "Facebook"),
    ]
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="social_accounts")
    platform = models.CharField(max_length=12, choices=PLATFORM_CHOICES, default="instagram")
    username = models.CharField(max_length=80)
    url = models.URLField(blank=True)
    followers_start = models.PositiveIntegerField("Boshlang‘ich obunachilar", default=0)

    class Meta:
        unique_together = [("platform", "username")]

    def __str__(self):
        return f"{self.get_platform_display()} @{self.username}"


class ClientMembership(models.Model):
    """Mijoz kabinetiga kiradigan foydalanuvchi va uning shu mijozdagi o'rni."""

    OWNER = "owner"
    MEMBER = "member"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="client_memberships")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=10, choices=[(OWNER, "Egasi"), (MEMBER, "Xodimi")], default=OWNER)
    can_see_payments = models.BooleanField(default=True)

    class Meta:
        unique_together = [("user", "client")]


class Project(models.Model):
    """Loyiha = mijoz + tarif obunasi. Narx imzolangan kundagi tarif versiyasidan qotiriladi."""

    STATUS_CHOICES = [("active", "Faol"), ("paused", "To‘xtatilgan"), ("ended", "Tugagan")]

    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="projects")
    tariff_version = models.ForeignKey("catalog.TariffVersion", on_delete=models.PROTECT, related_name="projects")
    title = models.CharField(max_length=150, blank=True)
    price = models.DecimalField(max_digits=MONEY_DIGITS, decimal_places=MONEY_PLACES)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    contract_number = models.CharField(max_length=40, blank=True)
    contract_signed_at = models.DateField(null=True, blank=True)
    min_term_months = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return self.title or f"{self.client.name} · {self.tariff_version.tariff.name}"

    @property
    def monthly_amount(self):
        from common.money import D, q

        return q(D(self.price) * (1 - D(self.discount_percent) / 100))


class ProjectAssignment(models.Model):
    """Xodimni loyihaga biriktirish: lavozim va (ixtiyoriy) qo'lda berilgan foiz."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="assignments")
    position = models.ForeignKey("accounts.Position", on_delete=models.PROTECT)
    share_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Bo'sh bo'lsa, maosh qoidasidagi foiz olinadi",
    )
    started_at = models.DateField()
    ended_at = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["position__sort"]

    def is_active_on(self, day):
        return self.started_at <= day and (self.ended_at is None or self.ended_at >= day)
