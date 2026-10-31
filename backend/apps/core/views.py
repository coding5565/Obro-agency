from collections import Counter
from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clients.models import Client, Project
from apps.clients.selectors import visible_projects
from apps.content import models as cm
from apps.content.shoots import when_text
from apps.core.models import AuditLog
from apps.finance.models import Invoice, Payment
from apps.leads import models as lead_models
from apps.leads.models import Lead
from apps.leads.services import counted
from apps.tasks import models as tm
from apps.worklog import models as wl
from common import access
from common.money import q
from common.permissions import ObroPermission


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "actor", "actor_name", "action", "entity_type", "entity_id", "before", "after", "comment",
                  "created_at"]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor")
    serializer_class = AuditLogSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.AUDIT_VIEW}
    filterset_fields = ["action", "entity_type", "entity_id", "actor"]


def _alerts(user, projects, today):
    """Bosh ekrandagi ogohlantirishlar: bugun e'tibor talab qiladigan narsalar."""
    alerts = []
    tomorrow = today + timedelta(days=1)
    shoots = cm.ShootDay.objects.filter(project__in=projects, status="planned", date__in=[today, tomorrow])
    if not user.has_obro_perm(access.CONTENT_MANAGE):
        shoots = shoots.filter(participants=user)
    for shoot in shoots.select_related("project__client").distinct():
        day = "Bugun" if shoot.date == today else "Ertaga"
        alerts.append({"level": "warn" if shoot.date == today else "info", "link": "/app/schedule",
                       "title": f"{day} syomka: {shoot.project.client.name} · {when_text(shoot)}"})
    if user.has_obro_perm(access.CONTENT_VIEW):
        mine = cm.Brief.objects.filter(project__in=projects, status__in=cm.Brief.OPEN)
        if not user.has_obro_perm(access.CONTENT_MANAGE):
            mine = mine.filter(assignee=user)
        late = mine.filter(deadline__lt=timezone.now()).count()
        if late:
            alerts.append({"level": "danger", "title": f"Muddati o‘tgan TZ: {late} ta", "link": "/app/briefs"})
        unaccepted = mine.filter(status=cm.Brief.SENT).count()
        if unaccepted:
            alerts.append({"level": "info", "title": f"Qabul qilinmagan TZ: {unaccepted} ta", "link": "/app/briefs"})
    if user.has_obro_perm(access.LEADS_VIEW):
        waiting = counted(Lead.objects.filter(project__in=projects, status=lead_models.NEW)).count()
        if waiting:
            alerts.append({"level": "danger", "title": f"Javob kutayotgan lidlar: {waiting} ta",
                           "link": "/app/leads?status=new"})
    return alerts


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
