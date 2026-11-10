"""Botdagi «Holat», «Lidlar», «To'lov» javoblari. Har kim faqat o'z ma'lumotini ko'radi (rol va loyiha bo'yicha)."""
from collections import Counter
from datetime import timedelta
from html import escape

from django.db.models import Count, Sum
from django.utils import timezone

from apps.clients.selectors import visible_projects
from apps.content import models as cm
from apps.finance.models import Invoice, Payment
from apps.leads import models as lm
from apps.leads.services import counted
from apps.tasks import models as tm
from apps.worklog import models as wl
from common import access
from common.calc import invoices as invoice_calc
from common.calc.progress import pace

KIND = {"post": "Post", "stories": "Stories", "reels": "Reels", "video": "Video"}


def money(value, currency="UZS"):
    text = f"{int(round(float(value))):,}".replace(",", " ")
    return f"${text}" if currency == "USD" else f"{text} so‘m"


def _client_project(user):
    membership = user.client_memberships.select_related("client").first()
    if membership is None:
        return None, None
    project = (membership.client.projects.filter(status="active").select_related("tariff_version__tariff")
               .order_by("-start_date").first())
    return membership, project


def _open_invoices(qs):
    return [inv for inv in qs.filter(issued_at__isnull=False, cancelled_at__isnull=True) if inv.outstanding > 0]


def client_status(user):
    membership, project = _client_project(user)
    if project is None:
        return "Faol loyiha topilmadi. SMM menejeringizga yozing."
    today = timezone.localdate()
    index = max(invoice_calc.period_index_for(project.start_date, today), 0)
    begin, end = invoice_calc.billing_period(project.start_date, index)
    done = dict(cm.ContentItem.objects.filter(project=project, status=cm.PUBLISHED, counts_toward_limit=True,
                                              published_at__date__range=(begin, end))
                .values_list("kind").annotate(n=Count("id")))
    period_days = (end - begin).days + 1
    lines = [f"<b>{escape(membership.client.name)}</b> · {escape(project.tariff_version.tariff.name)}",
             f"Davr: {begin:%d.%m} – {end:%d.%m.%Y}", "", "<b>Shu oy joylandi</b>"]
    for kind, planned in project.tariff_version.limit_map().items():
        row = pace(done.get(kind, 0), planned, (today - begin).days + 1, period_days)
        lines.append(f"• {KIND.get(kind, kind)}: {row['done']} / {row['planned']}")
    waiting = cm.ContentItem.objects.filter(project=project, status=cm.CLIENT_REVIEW).count()
    lines.append("")
    lines.append(f"Tasdig‘ingizni kutmoqda: <b>{waiting}</b> ta" if waiting else "Tasdiq kutayotgan material yo‘q")
    shoot = project.shoot_days.filter(date__gte=today, status="planned").order_by("date", "start_time").first()
    if shoot:
        time_part = f" {shoot.start_time:%H:%M}" if shoot.start_time else ""
        lines.append(f"Keyingi syomka: {shoot.date:%d.%m}{time_part}")
    if "leads" in (project.tariff_version.panel_features or []):
        leads = counted(lm.Lead.objects.filter(project=project))
        lines.append(f"Lidlar: bugun {leads.filter(created_at__date=today).count()}, "
                     f"7 kunda {leads.filter(created_at__date__gte=today - timedelta(days=6)).count()}")
    if membership.can_see_payments:
        debt = _open_invoices(Invoice.objects.filter(project__client=membership.client))
        if debt:
            total = Counter()
            for inv in debt:
                total[inv.currency] += inv.outstanding
            lines.append("To‘lanmagan: " + ", ".join(money(v, c) for c, v in total.items()))
        lines.append(f"Keyingi to‘lov davri: {invoice_calc.billing_period(project.start_date, index + 1)[0]:%d.%m.%Y}")
    return "\n".join(lines)


def staff_status(user):
    from apps.payroll.services import my_summary

    today = timezone.localdate()
    projects = visible_projects(user).filter(status="active")
    tasks = tm.Task.objects.filter(project__in=projects, assignee=user, status__in=[tm.TODO, tm.IN_PROGRESS])
    briefs = cm.Brief.objects.filter(assignee=user, status__in=cm.Brief.OPEN)
    shoots = cm.ShootDay.objects.filter(participants=user, status="planned", date__gte=today).order_by("date")
    pay = my_summary(user, today.year, today.month)["total_uzs"]
    lines = [f"<b>{escape(user.full_name)}</b> · {escape(user.get_role_display())}", "",
             f"Ochiq vazifalar: <b>{tasks.count()}</b> (bugun {tasks.filter(due_date=today).count()}, "
             f"muddati o‘tgan {tasks.filter(due_date__lt=today).count()})",
             f"Ochiq TZ: <b>{briefs.count()}</b>"]
    first = shoots.select_related("project__client").first()
    if first:
        lines.append(f"Keyingi syomka: {first.date:%d.%m} · {escape(first.project.client.name)}")
    if user.has_obro_perm(access.LEADS_VIEW):
        waiting = counted(lm.Lead.objects.filter(project__in=projects, status=lm.NEW)).count()
        lines.append(f"Javob kutayotgan lidlar: <b>{waiting}</b>")
    if user.has_obro_perm(access.WORKLOG_APPROVE):
        pending = wl.WorkLogEntry.objects.filter(project__in=projects, status=wl.SUBMITTED).count()
        lines.append(f"Tasdiq kutayotgan jurnal yozuvlari: {pending}")
    lines.append(f"Shu oy hisoblangan ulushingiz: <b>{money(pay)}</b>")
    return "\n".join(lines)


def manager_status(user):
    today = timezone.localdate()
    income = (Payment.objects.filter(paid_on__year=today.year, paid_on__month=today.month, cancelled_at__isnull=True)
              .aggregate(s=Sum("amount_uzs"))["s"] or 0)
    debt = Counter()
    late = 0
    for inv in _open_invoices(Invoice.objects.all()):
        debt[inv.currency] += inv.outstanding
        late += inv.due_date < today
    leads_today = counted(lm.Lead.objects.filter(created_at__date=today)).count()
    unanswered = counted(lm.Lead.objects.filter(status=lm.NEW)).count()
    lines = [f"<b>Agentlik holati · {today:%d.%m.%Y}</b>", "",
             f"Shu oy tushum: <b>{money(income)}</b>",
             "Qarzlar: " + (", ".join(money(v, c) for c, v in debt.items()) if debt else "yo‘q")
             + (f" (muddati o‘tgan {late} ta)" if late else ""),
             f"Faol mijozlar: {visible_projects(user).filter(status='active').count()}",
             f"Lidlar: bugun {leads_today}, javobsiz {unanswered}",
             f"Mijoz tasdig‘ida: {cm.ContentItem.objects.filter(status=cm.CLIENT_REVIEW).count()}",
             f"Tekshiruv kutayotgan jurnal: {wl.WorkLogEntry.objects.filter(status=wl.SUBMITTED).count()}",
             f"Muddati o‘tgan vazifalar: "
             f"{tm.Task.objects.filter(status__in=[tm.TODO, tm.IN_PROGRESS], due_date__lt=today).count()}"]
    lines.append("")
    lines.append("To‘liq hisobot: panel → Moliya → Foyda va hisobot")
    return "\n".join(lines)


def status_text(user):
    if user.is_client:
        return client_status(user)
    text = staff_status(user)
    if user.role in access.MANAGEMENT_ROLES:
        text = manager_status(user) + "\n\n" + text
    return text


def leads_text(user):
    if user.is_client:
        _, project = _client_project(user)
        if project is None or "leads" not in (project.tariff_version.panel_features or []):
            return "Lidlar bo‘limi tarifingizda yoqilmagan."
        qs = lm.Lead.objects.filter(project=project)
    else:
        if not user.has_obro_perm(access.LEADS_VIEW):
            return "Lidlar sizga ochiq emas."
        qs = lm.Lead.objects.filter(project__in=visible_projects(user))
    recent = counted(qs).select_related("project__client").order_by("-created_at")[:10]
    if not recent:
        return "Hozircha lid yo‘q."
    lines = ["<b>So‘nggi lidlar</b>"]
    for lead in recent:
        mark = "🔴" if lead.status == lm.NEW else "•"
        who = escape(lead.full_name or "Ismsiz")
        client = "" if user.is_client else f" · {escape(lead.project.client.name)}"
        lines.append(f"{mark} {who} {escape(lead.phone or '')} <i>({lead.get_status_display()}{client})</i>")
    return "\n".join(lines)


def payments_text(user):
    if not user.is_client:
        return "To‘lovlar mijoz kabineti uchun. Agentlik moliyasi: «Holat» yoki panel."
    membership, _ = _client_project(user)
    if membership is None or not membership.can_see_payments:
        return "To‘lovlarni ko‘rish ruxsati yo‘q."
    invoices = (Invoice.objects.filter(project__client=membership.client, issued_at__isnull=False,
                                       cancelled_at__isnull=True).order_by("-period_start")[:6])
    if not invoices:
        return "Hali hisob-faktura chiqarilmagan."
    lines = ["<b>Hisob-fakturalar</b>"]
    for inv in invoices:
        left = inv.outstanding
        state = "✅ to‘langan" if left <= 0 else f"qoldiq {money(left, inv.currency)}, muddat {inv.due_date:%d.%m}"
        lines.append(f"• {inv.period_start:%d.%m}–{inv.period_end:%d.%m}: {money(inv.total, inv.currency)} · {state}")
    return "\n".join(lines)
