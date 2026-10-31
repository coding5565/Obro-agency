"""Rejali ogohlantirishlar. `manage.py run_reminders` har 5 daqiqada ishga tushadi.

Har eslatmaning o'z kaliti (dedupe_key) bor, shuning uchun necha marta ishga tushsa ham bir marta boradi.
Telegram ulangan bo'lsa bot ham yuboradi; bo'lmasa panelda ko'rinadi.
"""
from datetime import time, timedelta

from django.conf import settings
from django.utils import timezone

from apps.accounts.models import User
from apps.clients.models import Project
from apps.content.models import Brief, ShootDay
from apps.content.shoots import start_of, when_text
from apps.finance.models import ExchangeRate
from apps.finance.rates import RateFetchError, store_cbu_rate
from apps.leads import models as lm
from apps.leads.services import counted, lead_text
from apps.notifications.services import notify, project_client_users, project_smm_managers
from apps.telegram.services import evening_reminders, morning_digest
from common import access

QUIET_FROM = time(22, 0)
QUIET_TO = time(8, 0)
MORNING = time(9, 0)
EVENING = time(18, 30)
RATE_CHECK = time(10, 0)


def _managers():
    return list(User.objects.filter(role__in=access.MANAGEMENT_ROLES, is_active=True))


def is_quiet(now):
    local = timezone.localtime(now).time()
    return local >= QUIET_FROM or local < QUIET_TO


def shoots(now):
    """Syomkadan 24 va 2 soat oldin. Vaqt o'zgarsa, kalit ham o'zgaradi va eslatma qayta boradi."""
    today = timezone.localtime(now).date()
    upcoming = (ShootDay.objects.filter(status="planned", date__range=(today, today + timedelta(days=2)))
                .select_related("project__client").prefetch_related("participants"))
    for shoot in upcoming:
        start = start_of(shoot)
        left = start - now
        if left <= timedelta(0):
            continue
        stamp = f"{shoot.pk}:{start:%Y%m%d%H%M}"
        client = shoot.project.client.name
        team = [*shoot.participants.all(), *project_smm_managers(shoot.project)]
        clients = project_client_users(shoot.project)
        if left <= timedelta(hours=2):
            notify(team, "shoot.soon", f"2 soatdan keyin syomka: {client}", body=when_text(shoot),
                   link="/app/schedule", dedupe_key=f"shoot2h:{stamp}")
            notify(clients, "shoot.soon", "Bugun syomka: 2 soat qoldi", body=when_text(shoot), link="/portal/shoots",
                   dedupe_key=f"shoot2h:{stamp}")
        elif left <= timedelta(hours=24):
            notify(team, "shoot.tomorrow", f"Syomka yaqin: {client}", body=when_text(shoot), link="/app/schedule",
                   dedupe_key=f"shoot24h:{stamp}")
            body = when_text(shoot) + (f"\nTayyorlab qo‘ying: {shoot.client_prep}" if shoot.client_prep else "")
            notify(clients, "shoot.confirm", "Syomka yaqin", body=body, link="/portal/shoots",
                   payload={"shoot_id": shoot.pk}, dedupe_key=f"shoot24h:{stamp}")
            if shoot.client_confirmed_at is None:
                notify(project_smm_managers(shoot.project), "shoot.unconfirmed",
                       f"Mijoz syomkani tasdiqlamadi: {client}", body=when_text(shoot), link="/app/schedule",
                       dedupe_key=f"shootunconf:{stamp}")


def briefs(now):
    today = timezone.localtime(now).date()
    active = Brief.objects.filter(status__in=Brief.OPEN).select_related("assignee", "project__client", "created_by")
    for brief in active:
        link = f"/app/briefs/{brief.pk}"
        if (brief.status == Brief.SENT and brief.seen_at is None and brief.sent_at
                and now - brief.sent_at >= timedelta(hours=2) and not is_quiet(now)):
            notify([brief.assignee], "brief.unseen", f"TZ hali ochilmagan: {brief.title}", link=link,
                   dedupe_key=f"briefunseen:{brief.pk}:{brief.sent_at:%Y%m%d%H%M}")
        if not brief.deadline:
            continue
        stamp = f"{brief.pk}:{brief.deadline:%Y%m%d%H%M}"
        left = brief.deadline - now
        if left <= timedelta(0):
            people = [brief.assignee, brief.created_by, *project_smm_managers(brief.project)]
            notify(people, "brief.overdue", f"TZ muddati o‘tdi: {brief.title}",
                   body=f"{brief.assignee.full_name} · {brief.project.client.name}", link=link,
                   dedupe_key=f"briefover:{stamp}:{today:%Y%m%d}")
        elif left <= timedelta(hours=24):
            notify([brief.assignee], "brief.deadline", f"TZ muddati yaqin: {brief.title}",
                   body=f"{timezone.localtime(brief.deadline):%d.%m %H:%M} gacha", link=link,
                   dedupe_key=f"briefsoon:{stamp}")


def leads(now):
    """Javobsiz lid: 15 daqiqada mas'ulga, 1 soatda rahbarga. Tunda bezovta qilinmaydi."""
    if is_quiet(now):
        return
    fresh = (lm.Lead.objects.filter(status=lm.NEW, first_response_at__isnull=True, duplicate_of__isnull=True,
                                    created_at__gte=now - timedelta(days=3))
             .select_related("project__client", "assigned_to"))
    for lead in fresh:
        age = now - lead.created_at
        link = f"/app/leads?lead={lead.pk}"
        payload = {"lead_id": lead.pk}
        client = lead.project.client.name
        if age >= timedelta(minutes=settings.LEAD_SLA_MINUTES):
            notify([lead.assigned_to, *project_smm_managers(lead.project)], "lead.sla",
                   f"Lidga javob berilmadi · {client}", body=lead_text(lead), link=link, payload=payload,
                   dedupe_key=f"leadsla:{lead.pk}")
        if age >= timedelta(minutes=settings.LEAD_ESCALATE_MINUTES):
            notify(_managers(), "lead.sla", f"1 soatdan beri javobsiz lid · {client}", body=lead_text(lead),
                   link=link, payload=payload, dedupe_key=f"leadesc:{lead.pk}")
    due = (lm.Lead.objects.filter(next_contact_at__lte=now, next_contact_at__gte=now - timedelta(days=2))
           .exclude(status__in=lm.CLOSED).select_related("project__client", "assigned_to"))
    for lead in due:
        target = lead.assigned_to
        people = [target] if target else project_smm_managers(lead.project)
        link = f"/portal/leads?lead={lead.pk}" if target and target.is_client else f"/app/leads?lead={lead.pk}"
        notify(people, "lead.followup", "Lid bilan qayta bog‘lanish vaqti", body=lead_text(lead), link=link,
               payload={"lead_id": lead.pk}, dedupe_key=f"leadnext:{lead.pk}:{lead.next_contact_at:%Y%m%d%H%M}")


def daily_lead_report(now):
    """Ertalab kechagi lidlar soni: mijozga va SMM menejerga."""
    yesterday = timezone.localtime(now).date() - timedelta(days=1)
    for project in Project.objects.filter(status="active").select_related("client", "tariff_version"):
        qs = counted(lm.Lead.objects.filter(project=project, created_at__date=yesterday))
        total = qs.count()
        if not total:
            continue
        won = qs.filter(status=lm.WON).count()
        waiting = qs.filter(status=lm.NEW).count()
        body = f"Lidlar: {total} · sotildi: {won} · javobsiz: {waiting}"
        key = f"leadreport:{project.pk}:{yesterday:%Y%m%d}"
        notify(project_smm_managers(project), "lead.report", f"Kechagi lidlar · {project.client.name}", body=body,
               link="/app/leads", dedupe_key=key)
        if "leads" in (project.tariff_version.panel_features or []):
            notify(project_client_users(project), "lead.report", "Kechagi lidlar", body=body, link="/portal/leads",
                   dedupe_key=key)


def rate_missing(now):
    """Server cbu.uz'ga ulana olmasa, rahbarga kursni qo'lda kiritishni eslatadi."""
    today = timezone.localtime(now).date()
    if not ExchangeRate.objects.filter(currency="USD", date=today).exists():
        notify(_managers(), "rate.missing", "Bugungi dollar kursini kiriting",
               body="cbu.uz’dan avtomatik olinmadi. Moliya bo‘limida qo‘lda kiriting.", link="/app/finance",
               dedupe_key=f"ratemissing:{today:%Y%m%d}")


def run_due(now=None):
    now = now or timezone.now()
    local = timezone.localtime(now)
    shoots(now)
    briefs(now)
    leads(now)
    if local.time() >= MORNING:
        morning_digest(local.date())
        daily_lead_report(now)
    if local.time() >= RATE_CHECK:
        if settings.CBU_AUTO_FETCH and not ExchangeRate.objects.filter(currency="USD", date=local.date()).exists():
            try:
                store_cbu_rate("USD", local.date())
            except RateFetchError:
                pass  # Quyidagi eslatma rahbarga kursni qo'lda kiritishni aytadi.
        rate_missing(now)
    if local.time() >= EVENING:
        evening_reminders(local.date())
