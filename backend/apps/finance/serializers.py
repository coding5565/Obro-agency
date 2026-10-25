from rest_framework import serializers

from apps.finance.models import (
    CashAccount,
    ExchangeRate,
    Expense,
    ExpenseCategory,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
)
from common.calc.invoices import STATUS_LABELS
from common.money import CURRENCY_CHOICES


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "date", "currency", "rate_to_uzs", "source"]


class CashAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashAccount
        fields = ["id", "name", "kind", "currency", "is_active"]


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

    class Meta:
        model = Payment
        fields = ["id", "client", "client_name", "project", "amount", "currency", "rate_to_uzs", "amount_uzs",
                  "method", "method_label", "account", "paid_on", "note", "received_by_name", "allocations",
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
                  "account", "project", "description", "receipt", "status", "status_label", "created_by_name",
                  "cancelled_at", "cancel_reason", "created_at"]
        read_only_fields = ["amount_uzs", "status", "cancelled_at", "cancel_reason"]
