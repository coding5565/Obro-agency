"""Mijoz kabineti API (/api/v1/portal/). Har bir so'rov foydalanuvchining o'z mijozi bilan cheklangan."""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Position
from apps.clients.selectors import client_for_portal
from apps.content import models as cm
from apps.content.services import client_decide
from apps.finance.models import Invoice
from apps.metrics.models import AdStat, MetricSnapshot
from apps.notifications.services import notify, project_smm_managers
from apps.portal import serializers as ps
from apps.tasks.models import Task
from apps.worklog import models as wl
from common.calc import invoices as invoice_calc
from common.calc.progress import pace
from common.dates import month_range, parse_month
from common.money import q
from common.permissions import IsClientUser


class PortalView(APIView):
    permission_classes = [IsClientUser]
    feature = None  # tarifda yoqilgan bo'lishi kerak bo'lgan bo'lim

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        membership = client_for_portal(request.user, request.query_params.get("client"))
        if membership is None:
            raise NotFound("Mijoz topilmadi")
        self.membership = membership
        self.client = membership.client
        self.project = (self.client.projects.filter(status="active").select_related("tariff_version__tariff")
                        .order_by("-start_date").first())
        if self.feature and self.feature not in self.features:
            raise PermissionDenied("Bu bo‘lim sizning tarifingizda yo‘q")

    @property
    def features(self):
        return set(self.project.tariff_version.panel_features) if self.project else set()


class DashboardView(PortalView):
    feature = "dashboard"

    def get(self, request):
        today = timezone.localdate()
        project = self.project
        data = {
            "client": {"id": self.client.id, "name": self.client.name},
            "features": sorted(self.features),
            "project": None,
        }
        if project is None:
            return Response(data)
        index = max(invoice_calc.period_index_for(project.start_date, today), 0)
        begin, end = invoice_calc.billing_period(project.start_date, index)
        published = (cm.ContentItem.objects.filter(project=project, status=cm.PUBLISHED, counts_toward_limit=True,
                                                   published_at__date__range=(begin, end))
                     .values("kind").annotate(n=Count("id")))
        done = {row["kind"]: row["n"] for row in published}
        period_days = (end - begin).days + 1
        elapsed = (today - begin).days + 1
        limits = [{"kind": kind, **pace(done.get(kind, 0), planned, elapsed, period_days)}
                  for kind, planned in project.tariff_version.limit_map().items()]
        next_invoice_date = invoice_calc.billing_period(project.start_date, index + 1)[0]
        smm = project_smm_managers(project)
        data["project"] = {
            "tariff": project.tariff_version.tariff.name,
            "period_start": begin,
            "period_end": end,
            "limits": limits,
            "next_payment_date": next_invoice_date,
            "monthly_amount": str(project.monthly_amount) if self.membership.can_see_payments else None,
            "currency": project.currency,
            "manager": {"full_name": smm[0].full_name} if smm else None,
        }
        awaiting = cm.ContentItem.objects.filter(project=project, status=cm.CLIENT_REVIEW)
        data["approvals"] = {
            "count": awaiting.count(),
            "items": ps.PortalApprovalItemSerializer(awaiting[:4], many=True, context={"request": request}).data,
        }
        if "worklog" in self.features:
            entries = _client_worklog(project).filter(date=today)[:10]
            data["today"] = ps.PortalWorklogSerializer(entries, many=True).data
        if "metrics" in self.features:
            data["metrics"] = _metrics_summary(self.client)
        if "ads" in self.features:
            data["ads"] = _ads_summary(project, begin, end)
        upcoming = project.shoot_days.filter(date__gte=today, status="planned").order_by("date")[:3]
        data["shoot_days"] = [{"date": s.date, "location": s.location} for s in upcoming]
        return Response(data)


def _client_worklog(project):
    return wl.WorkLogEntry.objects.filter(project=project, status=wl.APPROVED, client_visible=True)


def _metrics_summary(client):
    result = []
    for account in client.social_accounts.all():
        snaps = list(MetricSnapshot.objects.filter(social_account=account).order_by("-date")[:9])
        latest = snaps[0] if snaps else None
        previous = snaps[1] if len(snaps) > 1 else None
        result.append({
            "account": str(account),
            "followers": latest.followers if latest else account.followers_start,
            "followers_change": (latest.followers - previous.followers) if latest and previous else None,
            "followers_since_start": (latest.followers - account.followers_start) if latest else 0,
            "reach": latest.reach if latest else None,
            "engagement_rate": str(latest.engagement_rate) if latest else None,
            "history": [{"date": s.date, "followers": s.followers, "reach": s.reach} for s in reversed(snaps)],
        })
    return result


def _ads_summary(project, begin, end):
    stats = AdStat.objects.filter(campaign__project=project, date__range=(begin, end))
    totals = defaultdict(lambda: {"spend": 0, "leads": 0, "clicks": 0, "impressions": 0})
    for stat in stats:
        t = totals[stat.currency]
        t["spend"] += stat.spend
        t["leads"] += stat.leads
        t["clicks"] += stat.clicks
        t["impressions"] += stat.impressions
    result = []
    for currency, t in totals.items():
        cpl = q(t["spend"] / t["leads"]) if t["leads"] else None
        result.append({"currency": currency, "spend": str(q(t["spend"])), "leads": t["leads"], "clicks": t["clicks"],
                       "impressions": t["impressions"], "cost_per_lead": str(cpl) if cpl is not None else None})
    return result


class CalendarView(PortalView):
    feature = "calendar"

    def get(self, request):
        if self.project is None:
            return Response([])
        year, month = parse_month(request.query_params.get("month"))
        start, end = month_range(year, month)
        items = (cm.ContentItem.objects.filter(project=self.project, planned_date__range=(start, end))
                 .exclude(status=cm.CANCELLED))
        return Response(ps.PortalCalendarItemSerializer(items, many=True).data)


class ApprovalListView(PortalView):
    feature = "approvals"

    def get(self, request):
        if self.project is None:
            return Response([])
        items = cm.ContentItem.objects.filter(project=self.project, status=cm.CLIENT_REVIEW)
        return Response(ps.PortalApprovalItemSerializer(items, many=True, context={"request": request}).data)


class ApprovalDetailView(PortalView):
    feature = "approvals"

    def _item(self, pk):
        # Mijoz faqat o'ziga yuborilgan versiyasi bor kontentni ko'radi.
        return get_object_or_404(cm.ContentItem.objects.filter(project__client=self.client,
                                                               versions__client_visible=True).distinct(), pk=pk)

    def get(self, request, pk):
        return Response(ps.PortalApprovalDetailSerializer(self._item(pk), context={"request": request}).data)

    def post(self, request, pk):
        item = self._item(pk)
        decision = request.data.get("decision")
        if decision not in ("approve", "changes"):
            return Response({"decision": "approve yoki changes"}, status=status.HTTP_400_BAD_REQUEST)
        client_decide(item, by=request.user, approve=decision == "approve", comment=request.data.get("comment", ""),
                      timecode=request.data.get("timecode", ""))
        return Response(ps.PortalApprovalDetailSerializer(item, context={"request": request}).data)


class WorklogView(PortalView):
    feature = "worklog"

    def get(self, request):
        if self.project is None:
            return Response([])
        since = timezone.localdate() - timedelta(days=int(request.query_params.get("days", 14)))
        entries = _client_worklog(self.project).filter(date__gte=since)[:300]
        return Response(ps.PortalWorklogSerializer(entries, many=True).data)


class MetricsView(PortalView):
    feature = "metrics"

    def get(self, request):
        return Response(_metrics_summary(self.client))


class AdsView(PortalView):
    feature = "ads"

    def get(self, request):
        if self.project is None:
            return Response([])
        year, month = parse_month(request.query_params.get("month"))
        start, end = month_range(year, month)
        return Response(_ads_summary(self.project, start, end))


class InvoicesView(PortalView):
    feature = "invoices"

    def get(self, request):
        if not self.membership.can_see_payments:
            raise PermissionDenied("To‘lovlarni ko‘rish uchun ruxsat yo‘q")
        invoices = (Invoice.objects.filter(project__client=self.client, issued_at__isnull=False,
                                           cancelled_at__isnull=True).prefetch_related("lines", "allocations"))
        return Response(ps.PortalInvoiceSerializer(invoices, many=True).data)


class RequestView(PortalView):
    """«So'rov yuborish»: SMM menejerga vazifa va bildirishnoma boradi."""

    feature = "requests"

    def post(self, request):
        text = (request.data.get("text") or "").strip()
        if not text or self.project is None:
            return Response({"text": "So‘rov matnini yozing"}, status=status.HTTP_400_BAD_REQUEST)
        managers = project_smm_managers(self.project)
        task = Task.objects.create(
            project=self.project, title=f"Mijoz so‘rovi: {text[:120]}", description=text,
            assignee=managers[0] if managers else None,
            position=Position.objects.filter(code=Position.SMM_TARGET).first(),
            due_date=timezone.localdate() + timedelta(days=1), priority="high", created_by=request.user,
        )
        notify(managers, "client.request", f"{self.client.name}: yangi so‘rov", body=text, link=f"/app/tasks/{task.pk}")
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
