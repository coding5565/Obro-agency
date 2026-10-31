from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.finance.models import CashAccount
from apps.payroll import services
from apps.payroll.models import Accrual, Adjustment, CompensationRule, Payout, PayrollSheet
from common import access, audit
from common.dates import parse_month
from common.permissions import ObroPermission

MANAGE = {"read": access.PAYROLL_MANAGE, "write": access.PAYROLL_MANAGE}


class CompensationRuleSerializer(serializers.ModelSerializer):
    position_name = serializers.CharField(source="position.name", read_only=True)
    tariff_name = serializers.CharField(source="tariff.name", read_only=True, default=None)
    project_title = serializers.SerializerMethodField()
    scope = serializers.CharField(read_only=True)

    class Meta:
        model = CompensationRule
        fields = ["id", "position", "position_name", "percent", "valid_from", "tariff", "tariff_name", "project",
                  "project_title", "scope", "note", "created_at"]

    def get_project_title(self, rule):
        return str(rule.project) if rule.project_id else None

    def validate(self, attrs):
        if attrs.get("tariff") and attrs.get("project"):
            raise serializers.ValidationError("Qoida yo tarifga, yo loyihaga bog‘lanadi — ikkalasiga emas")
        percent = attrs.get("percent")
        if percent is not None and not (0 <= percent <= 100):
            raise serializers.ValidationError({"percent": "Foiz 0 dan 100 gacha"})
        return attrs


class AccrualSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    position_name = serializers.CharField(source="position.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Accrual
        fields = ["id", "user", "user_name", "project", "client_name", "position_name", "payment", "base_amount",
                  "percent", "amount", "currency", "rate_to_uzs", "amount_uzs", "accrued_on", "status",
                  "status_label"]


class AdjustmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Adjustment
        fields = ["id", "user", "user_name", "kind", "kind_label", "amount_uzs", "year", "month", "reason",
                  "project", "account", "created_at"]

    def validate(self, attrs):
        account = attrs.get("account")
        if account is not None and account.currency != "UZS":
            raise serializers.ValidationError({"account": "Summa so‘mda: so‘mli hisobni tanlang"})
        if account is not None and attrs.get("kind") != "advance":
            attrs["account"] = None  # Hisobdan pul faqat avansda chiqadi.
        return attrs


class PayoutSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True, default="")
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Payout
        fields = ["id", "user", "user_name", "amount_uzs", "paid_on", "method", "method_label", "account",
                  "account_name", "note", "cancelled_at", "cancel_reason"]


class CompensationRuleViewSet(viewsets.ModelViewSet):
    queryset = CompensationRule.objects.select_related("position", "tariff", "project__client")
    serializer_class = CompensationRuleSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE
    filterset_fields = ["position", "tariff", "project"]
    pagination_class = None
    # Qoida o'chirilmaydi: o'zgartirish uchun yangi sana bilan yangi qoida qo'shiladi.
    http_method_names = ["get", "post", "head", "options"]

    def perform_create(self, serializer):
        rule = serializer.save(created_by=self.request.user)
        audit.log(self.request.user, "payroll_rule.create", rule, after=audit.snapshot(rule))


class AccrualViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AccrualSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE
    filterset_fields = ["user", "project", "status", "payment"]

    def get_queryset(self):
        qs = Accrual.objects.select_related("user", "project__client", "position")
        if self.request.query_params.get("month"):
            year, month = parse_month(self.request.query_params["month"])
            qs = qs.filter(accrued_on__year=year, accrued_on__month=month)
        return qs


class AdjustmentViewSet(viewsets.ModelViewSet):
    queryset = Adjustment.objects.select_related("user")
    serializer_class = AdjustmentSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE
    filterset_fields = ["user", "year", "month", "kind"]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def perform_create(self, serializer):
        sheet = PayrollSheet.objects.filter(year=serializer.validated_data["year"],
                                            month=serializer.validated_data["month"]).first()
        if sheet and sheet.status != PayrollSheet.DRAFT:
            raise serializers.ValidationError("Bu oy vedomosti tasdiqlangan — tuzatishni keyingi oyga kiriting")
        adjustment = serializer.save(created_by=self.request.user)
        audit.log(self.request.user, "payroll_adjustment.create", adjustment, after=audit.snapshot(adjustment))

    def perform_destroy(self, instance):
        sheet = PayrollSheet.objects.filter(year=instance.year, month=instance.month).first()
        if sheet and sheet.status != PayrollSheet.DRAFT:
            raise serializers.ValidationError("Tasdiqlangan oy tuzatishini o‘chirib bo‘lmaydi")
        audit.log(self.request.user, "payroll_adjustment.delete", instance, before=audit.snapshot(instance))
        instance.delete()


class PayoutViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """To'langan maoshlar tarixi. Yangi to'lov vedomost orqali qayd etiladi."""

    serializer_class = PayoutSerializer
    permission_classes = [ObroPermission]
    required_perms = MANAGE
    filterset_fields = ["user"]

    def get_queryset(self):
        qs = Payout.objects.select_related("user", "account").order_by("-paid_on", "-id")
        if self.request.query_params.get("month"):
            year, month = parse_month(self.request.query_params["month"])
            qs = qs.filter(sheet__year=year, sheet__month=month)
        return qs

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        payout = services.cancel_payout(self.get_object(), by=request.user, reason=request.data.get("reason", ""))
        return Response(self.get_serializer(payout).data)


def _sheet_payload(sheet):
    return {
        "year": sheet.year,
        "month": sheet.month,
        "status": sheet.status,
        "status_label": sheet.get_status_display(),
        "approved_at": sheet.approved_at,
        "rows": [{**row, **{k: str(v) for k, v in row.items() if k.endswith("_uzs")}}
                 for row in services.sheet_rows(sheet.year, sheet.month)],
    }


class PayrollSheetView(APIView):
    """GET /payroll/sheet/?month=2026-11 — vedomost; POST {action: approve|payout}."""

    permission_classes = [ObroPermission]
    required_perms = MANAGE

    def get(self, request):
        year, month = parse_month(request.query_params.get("month"))
        return Response(_sheet_payload(services.get_or_create_sheet(year, month)))

    def post(self, request):
        year, month = parse_month(request.data.get("month"))
        sheet = services.get_or_create_sheet(year, month)
        action_name = request.data.get("action")
        if action_name == "approve":
            services.approve_sheet(sheet, by=request.user)
        elif action_name == "payout":
            user = get_object_or_404(User, pk=request.data.get("user"))
            account_id = request.data.get("account")
            account = get_object_or_404(CashAccount, pk=account_id) if account_id else None
            services.record_payout(sheet, by=request.user, user=user, amount_uzs=request.data.get("amount_uzs"),
                                   paid_on=serializers.DateField().to_internal_value(request.data.get("paid_on")),
                                   method=request.data.get("method", "card"), note=request.data.get("note", ""),
                                   account=account)
        else:
            return Response({"action": "approve yoki payout"}, status=status.HTTP_400_BAD_REQUEST)
        sheet.refresh_from_db()
        return Response(_sheet_payload(sheet))


class MyPayrollView(APIView):
    """Xodimning o'z hisobi: qaysi loyihadan qancha (faqat o'ziniki)."""

    permission_classes = [ObroPermission]
    required_perms = {"read": access.PAYROLL_VIEW_OWN}

    def get(self, request):
        year, month = parse_month(request.query_params.get("month"))
        data = services.my_summary(request.user, year, month)
        rows = [{
            "client_name": acc.project.client.name,
            "position_name": acc.position.name,
            "base_amount": str(acc.base_amount),
            "percent": str(acc.percent),
            "amount": str(acc.amount),
            "currency": acc.currency,
            "amount_uzs": str(acc.amount_uzs),
            "accrued_on": acc.accrued_on,
            "status_label": acc.get_status_display(),
        } for acc in data["accruals"]]
        adjustments = [{"kind_label": a.get_kind_display(), "amount_uzs": str(a.signed_amount), "reason": a.reason}
                       for a in Adjustment.objects.filter(user=request.user, year=year, month=month)]
        return Response({"month": f"{year}-{month:02d}", "total_uzs": str(data["total_uzs"]), "accruals": rows,
                         "adjustments": adjustments})
