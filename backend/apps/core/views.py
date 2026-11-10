from collections import Counter
from datetime import timedelta

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.clients.models import Client, Project
from apps.clients.selectors import visible_projects
from apps.content import models as cm
from apps.content.shoots import when_text
from apps.core.models import AuditLog
from apps.finance.models import Expense, Invoice, Payment
from apps.leads import models as lead_models
from apps.leads.models import Lead
from apps.leads.services import counted
from apps.payroll.models import PayrollSheet
from apps.payroll.services import sheet_rows
from apps.tasks import models as tm
from apps.worklog import models as wl
from common import access
from common.activity import SECTIONS, section_of
from common.money import q
from common.permissions import ObroPermission

ACTION_LABELS = {
    "auth.login": "Tizimga kirdi", "telegram.link": "Telegram botni uladi",
    "client.create": "Yangi mijoz qo‘shdi", "project.create": "Yangi loyiha ochdi",
    "project.update": "Loyihani o‘zgartirdi",
    "assignment.create": "Xodimni loyihaga biriktirdi", "assignment.update": "Biriktirishni o‘zgartirdi",
    "invoice.create": "Hisob-faktura yaratdi", "invoice.issue": "Hisob-faktura chiqardi",
    "invoice.cancel": "Hisob-fakturani bekor qildi", "invoice.remind": "Mijozga to‘lov eslatmasi yubordi",
    "payment.create": "To‘lov qayd etdi", "payment.cancel": "To‘lovni bekor qildi",
    "payment.allocate_advance": "Avansni hisob-fakturaga o‘tkazdi",
    "expense.create": "Xarajat kiritdi", "expense.review": "Xarajat so‘rovini ko‘rib chiqdi",
    "expense.cancel": "Xarajatni bekor qildi", "account.update": "Hisobni o‘zgartirdi",
    "transfer.create": "Hisoblar orasida pul o‘tkazdi", "transfer.cancel": "O‘tkazmani bekor qildi",
    "withdrawal.create": "Sherik puli olinganini yozdi", "withdrawal.cancel": "Sherik pulini bekor qildi",
    "month.close": "Oyni yopdi", "month.reopen": "Oyni qayta ochdi",
    "payroll.approve": "Vedomostni tasdiqladi", "payroll.payout": "Maosh to‘ladi",
    "payroll.payout_cancel": "Maosh to‘lovini bekor qildi", "payroll_adjustment.create": "Avans yoki bonus kiritdi",
    "payroll_adjustment.delete": "Tuzatishni o‘chirdi", "payroll_rule.create": "Foiz qoidasi qo‘shdi",
    "user.update": "Xodimni o‘zgartirdi", "user.profile": "O‘z profilini o‘zgartirdi",
    "user.activate": "Xodimni faollashtirdi",
    "user.deactivate": "Xodimni o‘chirdi", "invite.create": "Taklif yaratdi",
    "tariff_version.create": "Tarif versiyasi qo‘shdi", "tariff_version.update": "Tarif versiyasini o‘zgartirdi",
}


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)
    label = serializers.SerializerMethodField()
    detail = serializers.SerializerMethodField()
    section = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ["id", "actor", "actor_name", "action", "label", "detail", "section", "entity_type", "entity_id",
                  "before", "after", "comment", "created_at"]

    def get_label(self, entry):
        if entry.action.startswith("api."):
            return entry.comment
        return ACTION_LABELS.get(entry.action, entry.action)

    def get_detail(self, entry):
        if entry.action.startswith("api."):
            return ""
        after = entry.after or {}
        parts = [entry.comment]
        amount = after.get("amount") or after.get("amount_uzs")
        if amount:
            parts.append(f"{amount} {after.get('currency', 'UZS')}")
        if after.get("description"):
            parts.append(str(after["description"]))
        return " · ".join(part for part in parts if part)

    def get_section(self, entry):
        return section_of(entry.entity_type)[1]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.AUDIT_VIEW}
    filterset_fields = ["action", "entity_type", "entity_id", "actor"]
    search_fields = ["comment", "actor__full_name"]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor")
        params = self.request.query_params
        section = SECTIONS.get(params.get("section", ""))
        if section:
            match = Q()
            for prefix in section[1]:
                match |= Q(entity_type__startswith=prefix)
            qs = qs.filter(match)
        if params.get("from"):
            qs = qs.filter(created_at__date__gte=params["from"])
        if params.get("to"):
            qs = qs.filter(created_at__date__lte=params["to"])
        return qs

    @action(detail=False, methods=["get"])
    def filters(self, request):
        """Filtr uchun: bo'limlar va jurnalda uchragan odamlar."""
        ids = AuditLog.objects.exclude(actor=None).values_list("actor", flat=True).distinct()
        people = User.objects.filter(pk__in=ids).order_by("full_name")
        return Response({"sections": [{"key": key, "label": value[0]} for key, value in SECTIONS.items()],
                         "actors": [{"id": u.id, "name": u.full_name} for u in people]})


def _alerts(user, projects, today):
    """«Bugun» ro'yxati: rolga qarab nima qilish kerakligi. Har band bosilsa, kerakli sahifa ochiladi."""
    items = []

    def add(level, title, link, count=None):
        items.append({"level": level, "title": title, "link": link, "count": count})

    tasks = tm.Task.objects.filter(project__in=projects, assignee=user, status__in=[tm.TODO, tm.IN_PROGRESS])
    late_tasks = tasks.filter(due_date__lt=today).count()
    if late_tasks:
        add("danger", f"Muddati o‘tgan vazifalar: {late_tasks} ta", "/app/tasks", late_tasks)
    today_tasks = tasks.filter(due_date=today).count()
    if today_tasks:
        add("warn", f"Bugungi vazifalar: {today_tasks} ta", "/app/tasks", today_tasks)

    if user.has_obro_perm(access.TASKS_MANAGE):
        review = tm.Task.objects.filter(project__in=projects, status=tm.REVIEW).count()
        if review:
            add("warn", f"Tekshirish kutayotgan vazifalar: {review} ta", "/app/tasks", review)

    tomorrow = today + timedelta(days=1)
    shoots = cm.ShootDay.objects.filter(project__in=projects, status="planned", date__in=[today, tomorrow])
    if not user.has_obro_perm(access.CONTENT_MANAGE):
        shoots = shoots.filter(participants=user)
    for shoot in shoots.select_related("project__client").distinct():
        day = "Bugun" if shoot.date == today else "Ertaga"
        level = "warn" if shoot.date == today else "info"
        add(level, f"{day} syomka: {shoot.project.client.name} · {when_text(shoot)}", "/app/schedule")

    if user.has_obro_perm(access.CONTENT_VIEW):
        manage = user.has_obro_perm(access.CONTENT_MANAGE)
        briefs = cm.Brief.objects.filter(project__in=projects, status__in=cm.Brief.OPEN)
        if not manage:
            briefs = briefs.filter(assignee=user)
        late = briefs.filter(deadline__lt=timezone.now()).count()
        if late:
            add("danger", f"Muddati o‘tgan TZ: {late} ta", "/app/briefs", late)
        unaccepted = briefs.filter(status=cm.Brief.SENT).count()
        if unaccepted:
            title = "Qabul qilinmagan TZ" if manage else "Yangi TZ: qabul qiling"
            add("info", f"{title}: {unaccepted} ta", "/app/briefs", unaccepted)
        if manage:
            review = cm.Brief.objects.filter(project__in=projects, status=cm.Brief.REVIEW).count()
            if review:
                add("warn", f"Tekshirishingiz kerak bo‘lgan TZ: {review} ta", "/app/briefs?tab=review", review)
            content = cm.ContentItem.objects.filter(project__in=projects)
            internal = content.filter(status=cm.INTERNAL_REVIEW).count()
            if internal:
                add("warn", f"Ichki tekshiruvdagi kontent: {internal} ta", "/app/content?view=board", internal)
            changes = content.filter(status=cm.CHANGES).count()
            if changes:
                add("danger", f"Mijoz tuzatish so‘ragan kontent: {changes} ta", "/app/content?view=board", changes)

    if user.has_obro_perm(access.WORKLOG_APPROVE):
        pending = wl.WorkLogEntry.objects.filter(project__in=projects, status=wl.SUBMITTED).count()
        if pending:
            add("info", f"Tasdiqlanadigan ish jurnali: {pending} ta", "/app/worklog", pending)

    if user.has_obro_perm(access.LEADS_VIEW):
        waiting = counted(Lead.objects.filter(project__in=projects, status=lead_models.NEW)).count()
        if waiting:
            add("danger", f"Javob kutayotgan lidlar: {waiting} ta", "/app/leads?status=new", waiting)

    if user.has_obro_perm(access.FINANCE_MANAGE):
        drafts = Invoice.objects.filter(issued_at__isnull=True, cancelled_at__isnull=True).count()
        if drafts:
            add("info", f"Chiqarilmagan hisob-faktura: {drafts} ta", "/app/finance?tab=invoices", drafts)
        overdue = sum(1 for inv in Invoice.objects.filter(issued_at__isnull=False, cancelled_at__isnull=True,
                                                           due_date__lt=today) if inv.outstanding > 0)
        if overdue:
            add("danger", f"To‘lov muddati o‘tgan: {overdue} ta", "/app/finance?tab=debts", overdue)
        requests = Expense.objects.filter(status=Expense.REQUESTED, cancelled_at__isnull=True).count()
        if requests:
            add("warn", f"Xarajat so‘rovlari: {requests} ta", "/app/finance?tab=expenses", requests)
    if user.has_obro_perm(access.PAYROLL_MANAGE) and today.day >= 3:
        last = today.replace(day=1) - timedelta(days=1)
        sheet = PayrollSheet.objects.filter(year=last.year, month=last.month).first()
        if (sheet is None or sheet.status == PayrollSheet.DRAFT) and sheet_rows(last.year, last.month):
            add("warn", f"{last:%m.%Y} maosh vedomosti tasdiqlanmagan", "/app/payroll")

    order = {"danger": 0, "warn": 1, "info": 2}
    return sorted(items, key=lambda item: order[item["level"]])


class DashboardView(APIView):
    """Jamoa bosh ekrani. Rahbar pul ko'rsatkichlarini ham ko'radi, xodim faqat o'z ishini."""

    permission_classes = [ObroPermission]
    required_perms = {"read": access.TASKS_VIEW}

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        projects = visible_projects(user).filter(status="active")
        tasks = tm.Task.objects.filter(project__in=projects, assignee=user, status__in=[tm.TODO, tm.IN_PROGRESS])
        content = cm.ContentItem.objects.filter(project__in=projects)
        data = {
            "today": today,
            "my_tasks": {
                "today": tasks.filter(due_date=today).count(),
                "overdue": tasks.filter(due_date__lt=today).count(),
                "open": tasks.count(),
            },
            "content": {
                "in_client_review": content.filter(status=cm.CLIENT_REVIEW).count(),
                "in_internal_review": content.filter(status=cm.INTERNAL_REVIEW).count(),
                "changes_requested": content.filter(status=cm.CHANGES).count(),
                "published_this_month": content.filter(status=cm.PUBLISHED, published_at__year=today.year,
                                                       published_at__month=today.month).count(),
            },
            "active_projects": projects.count(),
            "alerts": _alerts(user, projects, today),
        }
        if user.has_obro_perm(access.WORKLOG_APPROVE):
            data["worklog_pending"] = wl.WorkLogEntry.objects.filter(project__in=projects,
                                                                      status=wl.SUBMITTED).count()
        if user.has_obro_perm(access.FINANCE_MANAGE):
            open_invoices = [inv for inv in Invoice.objects.filter(issued_at__isnull=False, cancelled_at__isnull=True)
                             if inv.outstanding > 0]
            debt = Counter()
            for inv in open_invoices:
                debt[inv.currency] += inv.outstanding
            month_income = (Payment.objects.filter(paid_on__year=today.year, paid_on__month=today.month,
                                                   cancelled_at__isnull=True).aggregate(s=Sum("amount_uzs"))["s"])
            data["finance"] = {
                "month_income_uzs": str(q(month_income or 0)),
                "debt": {cur: str(q(val)) for cur, val in debt.items()},
                "overdue_invoices": sum(1 for inv in open_invoices if inv.due_date < today),
                "draft_invoices": Invoice.objects.filter(issued_at__isnull=True, cancelled_at__isnull=True).count(),
            }
            data["clients"] = {
                "active": Client.objects.filter(status="active").count(),
                "leads": Client.objects.filter(status="lead").count(),
                "projects_by_tariff": dict(Counter(
                    p.tariff_version.tariff.name for p in Project.objects.filter(status="active")
                    .select_related("tariff_version__tariff"))),
            }
        return Response(data)
