"""Moliya: kurs, kassa, hisob-faktura, to'lov, xarajat.

Qoidalar: summa faqat Decimal; har yozuvda valyuta; dollar yozuvida o'sha kungi kurs qotiriladi.
To'lov va xarajat o'chirilmaydi — faqat sabab yozilib bekor qilinadi.
"""
from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from common.calc import invoices as calc
from common.money import CURRENCY_CHOICES, MONEY_DIGITS, MONEY_PLACES, RATE_PLACES, USD, UZS, D, q


def money_field(**kwargs):
    return models.DecimalField(max_digits=MONEY_DIGITS, decimal_places=MONEY_PLACES, **kwargs)


def rate_field(**kwargs):
    return models.DecimalField(max_digits=14, decimal_places=RATE_PLACES, **kwargs)


class ExchangeRate(models.Model):
    """1 birlik valyuta necha so'm. Manba odatda Markaziy bank (cbu.uz)."""

    date = models.DateField()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    rate_to_uzs = rate_field()
    source = models.CharField(max_length=20, default="cbu")

    class Meta:
        ordering = ["-date"]
        unique_together = [("date", "currency")]

    @classmethod
    def rate_on(cls, currency, day):
        if currency == UZS:
            return D(1)
        rate = cls.objects.filter(currency=currency, date__lte=day).order_by("-date").first()
        return rate.rate_to_uzs if rate else None


class CashAccount(models.Model):
    KIND_CHOICES = [("cash", "Naqd kassa"), ("card", "Karta"), ("bank", "Bank hisobi")]

    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=5, choices=KIND_CHOICES, default="cash")
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=UZS)
    opening_balance = money_field(default=0, help_text="Tizim boshlangandagi qoldiq")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Invoice(models.Model):
    project = models.ForeignKey("clients.Project", on_delete=models.PROTECT, related_name="invoices")
    number = models.CharField(max_length=30, unique=True)
    period_start = models.DateField()
    period_end = models.DateField()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    total = money_field(default=0)
    transit_total = money_field(default=0, help_text="Agentlik daromadi bo'lmagan qism (reklama budjeti)")
    due_date = models.DateField()
    issued_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_start", "-id"]
        unique_together = [("project", "period_start")]

    def __str__(self):
        return self.number

    def recalc_totals(self, save=True):
        lines = list(self.lines.all())
        self.total = q(sum((line.amount for line in lines), D(0)))
        self.transit_total = q(sum((line.amount for line in lines if line.kind == InvoiceLine.TRANSIT), D(0)))
        if save:
            self.save(update_fields=["total", "transit_total"])

    @property
    def paid_amount(self):
        value = self.allocations.filter(payment__cancelled_at__isnull=True).aggregate(s=Sum("amount"))["s"]
        return q(value or 0)

    @property
    def outstanding(self):
        return q(D(self.total) - self.paid_amount)

    def status_on(self, today=None):
        return calc.invoice_status(
            issued=self.issued_at is not None,
            cancelled=self.cancelled_at is not None,
            total=self.total,
            paid=self.paid_amount,
            due_date=self.due_date,
            today=today or timezone.localdate(),
        )


class InvoiceLine(models.Model):
    TARIFF = "tariff"
    SERVICE = "service"
    TRANSIT = "transit"
    KIND_CHOICES = [(TARIFF, "Tarif"), (SERVICE, "Qo‘shimcha xizmat"), (TRANSIT, "Tranzit (reklama budjeti)")]

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    kind = models.CharField(max_length=8, choices=KIND_CHOICES, default=TARIFF)
    service = models.ForeignKey("catalog.Service", null=True, blank=True, on_delete=models.PROTECT)
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = money_field()
    amount = money_field()

    def save(self, *args, **kwargs):
        self.amount = q(D(self.quantity) * D(self.unit_price))
        super().save(*args, **kwargs)


class Payment(models.Model):
    """Mijoz to'lovi. Summa hisob-faktura valyutasida; so'mda olinsa ham kurs bilan yoziladi."""

    METHOD_CHOICES = [("cash", "Naqd"), ("card", "Karta"), ("transfer", "Bank o‘tkazmasi"),
                      ("click", "Click"), ("payme", "Payme")]

    client = models.ForeignKey("clients.Client", on_delete=models.PROTECT, related_name="payments")
    project = models.ForeignKey("clients.Project", null=True, blank=True, on_delete=models.PROTECT,
                                related_name="payments")
    amount = money_field()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    rate_to_uzs = rate_field(default=1)
    amount_uzs = money_field()
    method = models.CharField(max_length=10, choices=METHOD_CHOICES, default="cash")
    account = models.ForeignKey(CashAccount, null=True, blank=True, on_delete=models.PROTECT)
    paid_on = models.DateField()
    note = models.CharField(max_length=255, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="+")
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-paid_on", "-id"]

    @property
    def allocated_amount(self):
        return q(self.allocations.aggregate(s=Sum("amount"))["s"] or 0)

    @property
    def unallocated_amount(self):
        """Hech qaysi hisob-fakturaga tushmagan qism — avans."""
        return q(D(self.amount) - self.allocated_amount)


class PaymentAllocation(models.Model):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="allocations")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="allocations")
    amount = money_field()
    created_at = models.DateTimeField(auto_now_add=True)


class ExpenseCategory(models.Model):
    name = models.CharField(max_length=80, unique=True)
    sort = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort", "name"]

    def __str__(self):
        return self.name


class Expense(models.Model):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    STATUS_CHOICES = [(REQUESTED, "So‘rov"), (APPROVED, "Tasdiqlangan"), (REJECTED, "Rad etilgan")]

    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT)
    amount = money_field()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=UZS)
    rate_to_uzs = rate_field(default=1)
    amount_uzs = money_field()
    spent_on = models.DateField()
    account = models.ForeignKey(CashAccount, null=True, blank=True, on_delete=models.PROTECT)
    project = models.ForeignKey("clients.Project", null=True, blank=True, on_delete=models.PROTECT,
                                related_name="expenses")
    description = models.CharField(max_length=255)
    receipt = models.FileField(upload_to="receipts/%Y/%m/", blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=APPROVED)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-spent_on", "-id"]


class MonthClose(models.Model):
    """Yopilgan oy: undagi to'lov va xarajatlarni faqat rahbar o'zgartiradi."""

    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    closed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("year", "month")]

    @classmethod
    def is_closed(cls, day):
        return cls.objects.filter(year=day.year, month=day.month).exists()


class AccountTransfer(models.Model):
    """Hisoblar orasida pul o'tkazish (masalan, kartadan kassaga, dollarni so'mga almashtirish)."""

    from_account = models.ForeignKey(CashAccount, on_delete=models.PROTECT, related_name="transfers_out")
    to_account = models.ForeignKey(CashAccount, on_delete=models.PROTECT, related_name="transfers_in")
    amount = money_field(help_text="Chiqqan summa, birinchi hisob valyutasida")
    to_amount = money_field(help_text="Tushgan summa, ikkinchi hisob valyutasida")
    moved_on = models.DateField()
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-moved_on", "-id"]


class Partner(models.Model):
    """Agentlik sherigi va uning sof foydadagi ulushi."""

    name = models.CharField(max_length=120)
    share_percent = models.DecimalField(max_digits=5, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-share_percent", "name"]

    def __str__(self):
        return self.name


class PartnerWithdrawal(models.Model):
    """Sherik olgan pul. Xarajat emas: sof foydaga ta'sir qilmaydi, faqat kassadan chiqadi."""

    partner = models.ForeignKey(Partner, on_delete=models.PROTECT, related_name="withdrawals")
    amount = money_field()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=UZS)
    rate_to_uzs = rate_field(default=1)
    amount_uzs = money_field()
    taken_on = models.DateField()
    account = models.ForeignKey(CashAccount, null=True, blank=True, on_delete=models.PROTECT)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-taken_on", "-id"]


class RecurringExpense(models.Model):
    """Har oy takrorlanadigan xarajat (ijara, servis). Belgilangan kuni o'zi yoziladi."""

    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT)
    description = models.CharField(max_length=255)
    amount = money_field()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=UZS)
    day_of_month = models.PositiveSmallIntegerField(default=1, help_text="1 dan 28 gacha")
    account = models.ForeignKey(CashAccount, null=True, blank=True, on_delete=models.PROTECT)
    project = models.ForeignKey("clients.Project", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    is_active = models.BooleanField(default=True)
    last_month = models.CharField(max_length=7, blank=True, help_text="Oxirgi yozilgan oy: 2026-11")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["day_of_month", "description"]
