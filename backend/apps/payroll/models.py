"""Foizli maosh: qoidalar, hisoblanmalar, vedomost, to'lovlar.

Fiks oylik yo'q. Mijoz to'lovi qayd etilganda loyihaga biriktirilgan har xodimga ulush yoziladi.
"""
from django.conf import settings
from django.db import models

from apps.finance.models import money_field, rate_field
from common.money import CURRENCY_CHOICES, USD


class CompensationRule(models.Model):
    """Lavozim → foiz. Uch daraja: umumiy (tarif va loyiha bo'sh), tarif bo'yicha, loyiha bo'yicha."""

    position = models.ForeignKey("accounts.Position", on_delete=models.PROTECT, related_name="rules")
    percent = models.DecimalField(max_digits=5, decimal_places=2)
    valid_from = models.DateField()
    tariff = models.ForeignKey("catalog.Tariff", null=True, blank=True, on_delete=models.PROTECT)
    project = models.ForeignKey("clients.Project", null=True, blank=True, on_delete=models.CASCADE)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position__sort", "-valid_from"]
        unique_together = [("position", "valid_from", "tariff", "project")]

    @property
    def scope(self):
        if self.project_id:
            return "project"
        if self.tariff_id:
            return "tariff"
        return "global"


class PayrollSheet(models.Model):
    """Oylik vedomost: oy davomidagi hisoblanmalar va tuzatishlar yig'indisi."""

    DRAFT = "draft"
    APPROVED = "approved"
    PAID = "paid"
    STATUS_CHOICES = [(DRAFT, "Qoralama"), (APPROVED, "Tasdiqlandi"), (PAID, "To‘landi")]

    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=DRAFT)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-year", "-month"]
        unique_together = [("year", "month")]


class Accrual(models.Model):
    PENDING = "pending"
    APPROVED = "approved"
    PAID = "paid"
    CANCELLED = "cancelled"
    STATUS_CHOICES = [(PENDING, "Hisoblandi"), (APPROVED, "Tasdiqlandi"), (PAID, "To‘landi"),
                      (CANCELLED, "Bekor qilindi")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="accruals")
    project = models.ForeignKey("clients.Project", on_delete=models.PROTECT, related_name="accruals")
    position = models.ForeignKey("accounts.Position", on_delete=models.PROTECT)
    payment = models.ForeignKey("finance.Payment", on_delete=models.PROTECT, related_name="accruals")
    allocation = models.ForeignKey("finance.PaymentAllocation", on_delete=models.PROTECT, related_name="accruals")
    base_amount = money_field()
    percent = models.DecimalField(max_digits=7, decimal_places=4)
    amount = money_field()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    rate_to_uzs = rate_field(default=1)
    amount_uzs = money_field()
    accrued_on = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)
    sheet = models.ForeignKey(PayrollSheet, null=True, blank=True, on_delete=models.SET_NULL, related_name="accruals")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-accrued_on", "user__full_name"]
        indexes = [models.Index(fields=["user", "accrued_on"])]


class Adjustment(models.Model):
    """Avans, bonus, jarima va boshqa qo'lda tuzatishlar (so'mda)."""

    KIND_CHOICES = [("advance", "Avans"), ("bonus", "Bonus"), ("penalty", "Jarima"), ("piecework", "Dona ish"),
                    ("other", "Boshqa")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payroll_adjustments")
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    amount_uzs = money_field(help_text="Avans va jarima musbat kiritiladi, hisobda ayiriladi")
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    reason = models.CharField(max_length=255)
    project = models.ForeignKey("clients.Project", null=True, blank=True, on_delete=models.SET_NULL)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-year", "-month", "-id"]

    @property
    def signed_amount(self):
        return -self.amount_uzs if self.kind in ("advance", "penalty") else self.amount_uzs


class Payout(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payouts")
    sheet = models.ForeignKey(PayrollSheet, on_delete=models.PROTECT, related_name="payouts")
    amount_uzs = money_field()
    paid_on = models.DateField()
    method = models.CharField(max_length=10, choices=[("cash", "Naqd"), ("card", "Karta")], default="card")
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
