from pathlib import Path

from rest_framework import serializers

from apps.finance.models import (
    AccountTransfer,
    CashAccount,
    ExchangeRate,
    Expense,
    ExpenseCategory,
    Invoice,
    InvoiceLine,
    Partner,
    PartnerWithdrawal,
    Payment,
    PaymentAllocation,
    RecurringExpense,
)
from common.calc.invoices import STATUS_LABELS
from common.money import CURRENCY_CHOICES


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "date", "currency", "rate_to_uzs", "source"]


RECEIPT_MAX_BYTES = 10 * 1024 * 1024
RECEIPT_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


class CashAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashAccount
        fields = ["id", "name", "kind", "kind_label", "currency", "opening_balance", "balance", "is_active"]

    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    balance = serializers.SerializerMethodField()

    def get_balance(self, account):
        from apps.finance.cash import balance

        return str(balance(account))


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ["id", "kind", "service", "description", "quantity", "unit_price", "amount"]
        read_only_fields = ["amount"]


class InvoiceSerializer(serializers.ModelSerializer):
    client_id = serializers.IntegerField(source="project.client_id", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    tariff_name = serializers.CharField(source="project.tariff_version.tariff.name", read_only=True)
    lines = InvoiceLineSerializer(many=True, read_only=True)
    paid_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    outstanding = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    status = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = ["id", "number", "project", "client_id", "client_name", "tariff_name", "period_start",
                  "period_end", "currency", "total", "transit_total", "paid_amount", "outstanding", "due_date",
                  "issued_at", "cancelled_at", "cancel_reason", "status", "status_label", "note", "lines",
                  "created_at"]
        read_only_fields = ["number", "currency", "total", "transit_total", "issued_at", "cancelled_at",
                            "cancel_reason", "period_start", "period_end", "project"]

    def get_status(self, invoice):
        return invoice.status_on()

    def get_status_label(self, invoice):
        return STATUS_LABELS[invoice.status_on()]


class AllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ["id", "invoice", "invoice_number", "amount"]


class PaymentSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    allocations = AllocationSerializer(many=True, read_only=True)
    unallocated_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    received_by_name = serializers.CharField(source="received_by.full_name", read_only=True, default=None)
    account_name = serializers.CharField(source="account.name", read_only=True, default="")

    class Meta:
        model = Payment
        fields = ["id", "client", "client_name", "project", "amount", "currency", "rate_to_uzs", "amount_uzs",
                  "method", "method_label", "account", "account_name", "paid_on", "note", "received_by_name",
                  "allocations",
                  "unallocated_amount", "cancelled_at", "cancel_reason", "created_at"]


class PaymentCreateSerializer(serializers.Serializer):
    client = serializers.IntegerField()
    project = serializers.IntegerField(required=False, allow_null=True)
    invoice = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    currency = serializers.ChoiceField(choices=CURRENCY_CHOICES)
    rate_to_uzs = serializers.DecimalField(max_digits=14, decimal_places=4, required=False, allow_null=True)
    method = serializers.ChoiceField(choices=Payment.METHOD_CHOICES, default="cash")
    account = serializers.IntegerField(required=False, allow_null=True)
    paid_on = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "name", "sort"]


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    rate_to_uzs = serializers.DecimalField(max_digits=14, decimal_places=4, required=False, allow_null=True)

    class Meta:
        model = Expense
        fields = ["id", "category", "category_name", "amount", "currency", "rate_to_uzs", "amount_uzs", "spent_on",
                  "account", "account_name", "project", "client_name", "description", "receipt", "has_receipt",
                  "status", "status_label", "created_by_name", "cancelled_at", "cancel_reason", "created_at"]
        read_only_fields = ["amount_uzs", "status", "cancelled_at", "cancel_reason"]
        extra_kwargs = {"receipt": {"write_only": True}}

    account_name = serializers.CharField(source="account.name", read_only=True, default="")
    client_name = serializers.CharField(source="project.client.name", read_only=True, default="")
    has_receipt = serializers.SerializerMethodField()

    def get_has_receipt(self, expense):
        return bool(expense.receipt)

    def validate_receipt(self, file):
        if file.size > RECEIPT_MAX_BYTES:
            raise serializers.ValidationError("Chek 10 MB dan oshmasin")
        if Path(file.name).suffix.lower() not in RECEIPT_TYPES:
            raise serializers.ValidationError("Chek rasm yoki PDF bo‘lsin")
        return file


class AccountTransferSerializer(serializers.ModelSerializer):
    from_name = serializers.CharField(source="from_account.name", read_only=True)
    to_name = serializers.CharField(source="to_account.name", read_only=True)
    from_currency = serializers.CharField(source="from_account.currency", read_only=True)
    to_currency = serializers.CharField(source="to_account.currency", read_only=True)
    to_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True)

    class Meta:
        model = AccountTransfer
        fields = ["id", "from_account", "from_name", "from_currency", "to_account", "to_name", "to_currency", "amount",
                  "to_amount", "moved_on", "note", "cancelled_at", "cancel_reason"]
        read_only_fields = ["cancelled_at", "cancel_reason"]


class PartnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Partner
        fields = ["id", "name", "share_percent", "is_active"]

    def validate(self, attrs):
        share = attrs.get("share_percent", getattr(self.instance, "share_percent", 0))
        active = attrs.get("is_active", getattr(self.instance, "is_active", True))
        others = Partner.objects.filter(is_active=True)
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        taken = sum(p.share_percent for p in others)
        if share < 0 or (active and taken + share > 100):
            message = f"Sheriklar ulushi 100% dan oshmasin (band: {taken}%)"
            raise serializers.ValidationError({"share_percent": message})
        return attrs


class PartnerWithdrawalSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True, default="")
    rate_to_uzs = serializers.DecimalField(max_digits=14, decimal_places=4, required=False, allow_null=True)

    class Meta:
        model = PartnerWithdrawal
        fields = ["id", "partner", "partner_name", "amount", "currency", "rate_to_uzs", "amount_uzs", "taken_on",
                  "account", "account_name", "note", "cancelled_at", "cancel_reason"]
        read_only_fields = ["amount_uzs", "cancelled_at", "cancel_reason"]


class RecurringExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True, default="")
    client_name = serializers.CharField(source="project.client.name", read_only=True, default="")

    class Meta:
        model = RecurringExpense
        fields = ["id", "category", "category_name", "description", "amount", "currency", "day_of_month", "account",
                  "account_name", "project", "client_name", "is_active", "last_month"]
        read_only_fields = ["last_month"]

    def validate_day_of_month(self, day):
        # 28 dan keyingi kun har oyda ham yo'q (fevral).
        if not 1 <= day <= 28:
            raise serializers.ValidationError("Kun 1 dan 28 gacha bo‘lsin")
        return day

    def validate(self, attrs):
        account = attrs.get("account", getattr(self.instance, "account", None))
        currency = attrs.get("currency", getattr(self.instance, "currency", None))
        if account and account.currency != currency:
            raise serializers.ValidationError({"account": "Hisob valyutasi xarajat valyutasiga mos emas"})
        return attrs
