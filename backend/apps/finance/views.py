from collections import defaultdict
from decimal import Decimal
from pathlib import Path

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework import serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clients.models import Client, Project
from apps.finance import cash, reports, services
from apps.finance import serializers as s
from apps.finance.models import (
    AccountTransfer,
    CashAccount,
    ExchangeRate,
    Expense,
    ExpenseCategory,
    Invoice,
    InvoiceLine,
    MonthClose,
    Partner,
    PartnerWithdrawal,
    Payment,
    RecurringExpense,
)
from apps.finance.rates import RateFetchError, store_cbu_rate
from common import access, audit
from common.csvutil import csv_response
from common.dates import month_range, parse_month
from common.money import q
from common.permissions import ObroPermission

MANAGE = {"read": access.FINANCE_MANAGE, "write": access.FINANCE_MANAGE}


def _in_month(qs, field, request):
    """?month=2026-11 berilsa, faqat shu oy yozuvlari."""
    if request.query_params.get("month"):
        start, end = month_range(*parse_month(request.query_params["month"]))
        return qs.filter(**{f"{field}__range": (start, end)})
    return qs


class ExchangeRateViewSet(viewsets.ModelViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = s.ExchangeRateSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.FINANCE_MANAGE, "write": access.FINANCE_MANAGE}
    filterset_fields = ["currency", "date"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    @action(detail=False, methods=["post"])
    def fetch(self, request):
        """Markaziy bank kursini olib saqlaydi (bugun yoki berilgan sana)."""
        raw = request.data.get("date")
        day = drf_serializers.DateField().to_internal_value(raw) if raw else timezone.localdate()
        try:
            rate = store_cbu_rate(request.data.get("currency", "USD"), day)
        except RateFetchError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(s.ExchangeRateSerializer(rate).data)


class CashAccountViewSet(viewsets.ModelViewSet):
    queryset = CashAccount.objects.all()
    serializer_class = s.CashAccountSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        account = serializer.save()
        audit.log(self.request.user, "account.update", account, before=before, after=audit.snapshot(account))

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        year, month = parse_month(request.query_params.get("month"))
        start, end = month_range(year, month)
        return Response(cash.statement(self.get_object(), start, end))


class AccountTransferViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = AccountTransfer.objects.select_related("from_account", "to_account")
    serializer_class = s.AccountTransferSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE

    def perform_create(self, serializer):
        v = serializer.validated_data
        serializer.instance = cash.create_transfer(
            by=self.request.user, from_account=v["from_account"], to_account=v["to_account"], amount=v["amount"],
            to_amount=v.get("to_amount"), moved_on=v["moved_on"], note=v.get("note", ""),
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        transfer = cash.cancel_transfer(self.get_object(), by=request.user, reason=request.data.get("reason", ""))
        return Response(self.get_serializer(transfer).data)


class PartnerViewSet(viewsets.ModelViewSet):
    queryset = Partner.objects.all()
    serializer_class = s.PartnerSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.REPORTS_AGENCY, "write": access.REPORTS_AGENCY}
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]


class PartnerWithdrawalViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = PartnerWithdrawal.objects.select_related("partner", "account")
    serializer_class = s.PartnerWithdrawalSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.REPORTS_AGENCY, "write": access.REPORTS_AGENCY}
    filterset_fields = ["partner"]

    def perform_create(self, serializer):
        serializer.instance = cash.create_withdrawal(by=self.request.user, **serializer.validated_data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        withdrawal = cash.cancel_withdrawal(self.get_object(), by=request.user, reason=request.data.get("reason", ""))
        return Response(self.get_serializer(withdrawal).data)


class RecurringExpenseViewSet(viewsets.ModelViewSet):
    queryset = RecurringExpense.objects.select_related("category", "account", "project__client")
    serializer_class = s.RecurringExpenseSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                     viewsets.GenericViewSet):
    serializer_class = s.InvoiceSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE
    filterset_fields = ["project", "project__client", "currency"]
    search_fields = ["number", "project__client__name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Invoice.objects.select_related("project__client", "project__tariff_version__tariff").prefetch_related(
            "lines", "allocations__payment")
        state = self.request.query_params.get("state")
        if state == "open":
            qs = qs.filter(issued_at__isnull=False, cancelled_at__isnull=True)
        elif state == "draft":
            qs = qs.filter(issued_at__isnull=True, cancelled_at__isnull=True)
        return qs

    def perform_update(self, serializer):
        if serializer.instance.issued_at:
            raise ValidationError({"status": "Chiqarilgan hisob-faktura o‘zgartirilmaydi"})
        serializer.save()

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Bugungi kunda boshlangan davrlar uchun yetishmayotgan qoralamalarni yaratadi."""
        created = services.generate_due_invoices(by=request.user)
        return Response({"created": len(created), "numbers": [inv.number for inv in created]})

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        invoice = services.issue_invoice(self.get_object(), by=request.user)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        invoice = services.cancel_invoice(self.get_object(), by=request.user, reason=request.data.get("reason", ""))
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def remind(self, request, pk=None):
        rows = services.remind_invoice(self.get_object(), by=request.user)
        return Response({"sent": len(rows)})

    @action(detail=True, methods=["post"], url_path="lines")
    def add_line(self, request, pk=None):
        invoice = self.get_object()
        if invoice.issued_at or invoice.cancelled_at:
            raise ValidationError({"status": "Faqat qoralamaga qator qo‘shiladi"})
        serializer = s.InvoiceLineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(invoice=invoice)
        invoice.recalc_totals()
        return Response(self.get_serializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"lines/(?P<line_id>\d+)")
    def delete_line(self, request, pk=None, line_id=None):
        invoice = self.get_object()
        if invoice.issued_at or invoice.cancelled_at:
            raise ValidationError({"status": "Faqat qoralamadan qator o‘chiriladi"})
        get_object_or_404(InvoiceLine, invoice=invoice, pk=line_id).delete()
        invoice.recalc_totals()
        return Response(self.get_serializer(invoice).data)


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = s.PaymentSerializer
    permission_classes = [ObroPermission]
    required_perms = {**MANAGE, "create": access.FINANCE_MANAGE}
    filterset_fields = ["client", "project", "currency", "method"]
    search_fields = ["client__name", "note"]

    def get_queryset(self):
        qs = Payment.objects.select_related("client", "received_by", "account").prefetch_related("allocations__invoice")
        return _in_month(qs, "paid_on", self.request)

    def create(self, request):
        data = s.PaymentCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        client = get_object_or_404(Client, pk=v["client"])
        project = get_object_or_404(Project, pk=v["project"], client=client) if v.get("project") else None
        invoice = get_object_or_404(Invoice, pk=v["invoice"]) if v.get("invoice") else None
        account = get_object_or_404(CashAccount, pk=v["account"]) if v.get("account") else None
        payment = services.record_payment(
            client=client, project=project, invoice=invoice, amount=v["amount"], currency=v["currency"],
            rate_to_uzs=v.get("rate_to_uzs"), method=v["method"], account=account, paid_on=v["paid_on"],
            note=v["note"], by=request.user,
        )
        return Response(s.PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        payment = services.cancel_payment(self.get_object(), by=request.user, reason=request.data.get("reason", ""))
        return Response(s.PaymentSerializer(payment).data)

    @action(detail=True, methods=["post"], url_path="allocate-advance")
    def allocate_advance(self, request, pk=None):
        payment = self.get_object()
        services.allocate_advance(payment, by=request.user)
        return Response(s.PaymentSerializer(payment).data)


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = s.ExpenseCategorySerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.EXPENSES_REQUEST, "write": access.FINANCE_MANAGE}
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]


class ExpenseViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     viewsets.GenericViewSet):
    serializer_class = s.ExpenseSerializer
    permission_classes = [ObroPermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    required_perms = {"read": access.EXPENSES_REQUEST, "create": access.EXPENSES_REQUEST,
                      "receipt": access.EXPENSES_REQUEST, "write": access.FINANCE_MANAGE}
    filterset_fields = ["category", "status", "project", "currency"]
    search_fields = ["description"]

    def get_queryset(self):
        qs = Expense.objects.select_related("category", "created_by", "account", "project__client")
        if not self.request.user.has_obro_perm(access.FINANCE_MANAGE):
            qs = qs.filter(created_by=self.request.user)
        return _in_month(qs, "spent_on", self.request)

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """Chek faqat shu xarajatni ko'ra oladigan odamga beriladi."""
        expense = self.get_object()
        if not expense.receipt:
            raise ValidationError({"receipt": "Chek biriktirilmagan"})
        return FileResponse(expense.receipt.open("rb"), as_attachment=True, filename=Path(expense.receipt.name).name)

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        expense = services.create_expense(
            by=self.request.user, amount=data.pop("amount"), currency=data.pop("currency"),
            spent_on=data.pop("spent_on"), rate_to_uzs=data.pop("rate_to_uzs", None), **data,
        )
        serializer.instance = expense

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return Response(s.ExpenseSerializer(services.review_expense(self.get_object(), by=request.user,
                                                                    approve=True)).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return Response(s.ExpenseSerializer(services.review_expense(self.get_object(), by=request.user,
                                                                    approve=False)).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return Response(s.ExpenseSerializer(services.cancel_expense(self.get_object(), by=request.user,
                                                                    reason=request.data.get("reason", ""))).data)


class DebtsView(APIView):
    """Qarzdorlar: chiqarilgan, to'lanmagan hisob-fakturalar mijoz bo'yicha."""

    permission_classes = [ObroPermission]
    required_perms = {"read": access.FINANCE_VIEW_STATUS}

    def get(self, request):
        today = timezone.localdate()
        show_amounts = request.user.has_obro_perm(access.FINANCE_MANAGE)
        rows = defaultdict(lambda: {"outstanding": defaultdict(Decimal), "invoices": 0, "max_days_overdue": 0})
        names = {}
        invoices = Invoice.objects.filter(issued_at__isnull=False, cancelled_at__isnull=True).select_related(
            "project__client")
        if not request.user.sees_all_projects:
            from apps.clients.selectors import visible_projects

            invoices = invoices.filter(project__in=visible_projects(request.user))
        for inv in invoices:
            outstanding = inv.outstanding
            if outstanding <= 0:
                continue
            client = inv.project.client
            names[client.id] = client.name
            row = rows[client.id]
            row["outstanding"][inv.currency] += outstanding
            row["invoices"] += 1
            row["max_days_overdue"] = max(row["max_days_overdue"], (today - inv.due_date).days)
        result = []
        for client_id, row in rows.items():
            item = {"client_id": client_id, "client_name": names[client_id], "invoices": row["invoices"],
                    "days_overdue": max(row["max_days_overdue"], 0),
                    "status": "overdue" if row["max_days_overdue"] > 0 else "open"}
            if show_amounts:
                item["outstanding"] = {cur: str(q(val)) for cur, val in row["outstanding"].items()}
            result.append(item)
        return Response(sorted(result, key=lambda r: -r["days_overdue"]))


class MonthSummaryView(APIView):
    """Agentlik oylik foydasi (so'mda): tushum − jamoa ulushi − xarajatlar, hamda pul oqimi."""

    permission_classes = [ObroPermission]
    required_perms = {"read": access.REPORTS_AGENCY}

    def get(self, request):
        year, month = parse_month(request.query_params.get("month"))
        return Response(reports.month_summary(year, month))


class TrendView(APIView):
    permission_classes = [ObroPermission]
    required_perms = {"read": access.REPORTS_AGENCY}

    def get(self, request):
        year, month = parse_month(request.query_params.get("month"))
        return Response(reports.trend(year, month))


class ByClientView(APIView):
    permission_classes = [ObroPermission]
    required_perms = {"read": access.REPORTS_AGENCY}

    def get(self, request):
        year, month = parse_month(request.query_params.get("month"))
        return Response(reports.by_client(year, month))


class ExportView(APIView):
    permission_classes = [ObroPermission]
    required_perms = {"read": access.REPORTS_AGENCY}

    def get(self, request, kind):
        year, month = parse_month(request.query_params.get("month"))
        data = reports.export_rows(kind, year, month)
        if data is None:
            raise ValidationError({"kind": "Bunday hisobot yo‘q"})
        return csv_response(f"{kind}-{year}-{month:02d}.csv", *data)


class CloseMonthView(APIView):
    permission_classes = [ObroPermission]
    required_perms = {"write": access.REPORTS_AGENCY}

    def post(self, request):
        year, month = parse_month(request.data.get("month"))
        if request.data.get("action") == "reopen":
            # Yopilgan oyni ochish hisobotlarni o'zgartirishi mumkin, shuning uchun faqat super admin.
            if request.user.role != access.SUPER_ADMIN:
                raise PermissionDenied("Oyni faqat super admin qayta ochadi")
            closed = MonthClose.objects.filter(year=year, month=month).first()
            if closed:
                audit.log(request.user, "month.reopen", closed, comment=f"{month:02d}.{year}")
                closed.delete()
            return Response({"month": f"{year}-{month:02d}", "closed": False})
        close, created = MonthClose.objects.get_or_create(year=year, month=month, defaults={"closed_by": request.user})
        if created:
            audit.log(request.user, "month.close", close, comment=f"{month:02d}.{year}")
        return Response({"month": f"{year}-{month:02d}", "closed": True})
