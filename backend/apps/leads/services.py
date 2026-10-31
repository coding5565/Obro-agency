"""Lidlar: qabul qilish, takrorni aniqlash, mas'ul belgilash, holat va ogohlantirish."""
import json
from collections import Counter
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.leads import models as lm
from apps.notifications.models import Notification
from apps.notifications.services import notify, project_smm_managers
from common import access
from common.calc.leads import funnel, normalize_phone, parse_lead

DUPLICATE_WINDOW = timedelta(days=30)
RAW_LIMIT = 32_000


def _safe_raw(payload):
    try:
        text = json.dumps(payload, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return {"_raw": str(payload)[:RAW_LIMIT]}
    if len(text) > RAW_LIMIT:
        return {"_raw": text[:RAW_LIMIT], "_truncated": True}
    return json.loads(text)


def default_assignee(project, source=None):
    if source and source.default_assignee_id:
        return source.default_assignee
    managers = project_smm_managers(project)
    return managers[0] if managers else None


def _find_duplicate(project, phone):
    if not phone:
        return None
    since = timezone.now() - DUPLICATE_WINDOW
    return (lm.Lead.objects.filter(project=project, phone=phone, created_at__gte=since, duplicate_of__isnull=True)
            .order_by("created_at").first())


def _client_can_see_leads(project):
    return "leads" in (project.tariff_version.panel_features or [])


def lead_text(lead):
    parts = [lead.full_name or "Ismsiz", lead.phone or "telefon yo‘q"]
    if lead.form_name or lead.source_label:
        parts.append(lead.form_name or lead.source_label)
    return " · ".join(parts)


def _announce(lead):
    project = lead.project
    client = project.client.name
    payload = {"lead_id": lead.pk}
    recipients = [lead.assigned_to, *project_smm_managers(project)]
    notify(recipients, "lead.new", f"Yangi lid · {client}", body=lead_text(lead), link=f"/app/leads?lead={lead.pk}",
           payload=payload)
    if _client_can_see_leads(project):
        clients = [m.user for m in project.client.memberships.select_related("user")]
        notify(clients, "lead.new", "Yangi lid keldi", body=lead_text(lead), link=f"/portal/leads?lead={lead.pk}",
               payload=payload)
    source = lead.source
    if source and source.telegram_chat_id:
        Notification.objects.create(chat_id=source.telegram_chat_id, kind="lead.group",
                                    title=f"Yangi lid · {client}", body=lead_text(lead))


def _create(project, source, fields, raw, by=None):
    duplicate = _find_duplicate(project, fields.get("phone"))
    owner = duplicate.assigned_to if duplicate and duplicate.assigned_to else default_assignee(project, source)
    lead = lm.Lead.objects.create(
        project=project, source=source, source_label=source.name if source else "Qo‘lda", raw=raw,
        assigned_to=owner, duplicate_of=duplicate, **fields,
    )
    note = "Takroriy murojaat" if duplicate else ""
    lm.LeadEvent.objects.create(lead=lead, user=by, kind="created", text=note or f"Manba: {lead.source_label}")
    return lead


def ingest(source, payload):
    """Webhook'dan kelgan lidni yozadi. Qaytaradi: (lid, yangimi). Tizim qayta yuborsa ikkilanmaydi."""
    fields = parse_lead(payload)
    external_id = fields["external_id"]
    if external_id:
        existing = lm.Lead.objects.filter(source=source, external_id=external_id).first()
        if existing:
            return existing, False
    try:
        with transaction.atomic():
            lead = _create(source.project, source, fields, _safe_raw(payload))
            source.received_count += 1
            source.last_received_at = timezone.now()
            source.save(update_fields=["received_count", "last_received_at"])
    except IntegrityError:
        # Bir vaqtda ikkita bir xil so'rov keldi: ikkinchisi birinchisini qaytaradi.
        return lm.Lead.objects.get(source=source, external_id=external_id), False
    _announce(lead)
    return lead, True


def create_manual(*, project, by, full_name="", phone="", email="", message="", form_name=""):
    if not (phone or full_name):
        raise ValidationError({"phone": "Ism yoki telefon kerak"})
    fields = {"full_name": full_name[:150], "phone": normalize_phone(phone)[:20], "email": email,
              "message": message, "form_name": form_name[:150]}
    with transaction.atomic():
        lead = _create(project, None, fields, {}, by=by)
    _announce(lead)
    return lead


def can_access(user, lead):
    from apps.clients.selectors import visible_projects

    if user.is_client:
        return (_client_can_see_leads(lead.project)
                and user.client_memberships.filter(client_id=lead.project.client_id).exists())
    return (user.has_obro_perm(access.LEADS_VIEW)
            and visible_projects(user).filter(pk=lead.project_id).exists())


def _require(user, lead):
    if not can_access(user, lead):
        raise PermissionDenied("Bu lid sizga tegishli emas")


def set_status(lead, status, *, by, lost_reason="", sale_amount=None, sale_currency=None):
    _require(by, lead)
    if status not in dict(lm.STATUS_CHOICES):
        raise ValidationError({"status": "Noto‘g‘ri holat"})
    if status == lm.LOST and not lost_reason.strip():
        raise ValidationError({"lost_reason": "Nega rad etganini yozing"})
    old = lead.get_status_display()
    lead.status = status
    now = timezone.now()
    if status != lm.NEW and lead.first_response_at is None:
        lead.first_response_at = now
    if status in lm.CLOSED:
        lead.next_contact_at = None
    if status == lm.LOST:
        lead.lost_reason = lost_reason.strip()[:200]
    if status == lm.WON and sale_amount not in (None, ""):
        lead.sale_amount = sale_amount
        if sale_currency:
            lead.sale_currency = sale_currency
    lead.save()
    lm.LeadEvent.objects.create(lead=lead, user=by, kind="status",
                                text=f"{old} → {lead.get_status_display()}"[:500])
    return lead


def assign(lead, assignee, *, by):
    _require(by, lead)
    if assignee is not None:
        allowed = (lead.project.assignments.filter(user=assignee, ended_at__isnull=True).exists()
                   or lead.project.client.memberships.filter(user=assignee).exists()
                   or assignee.role in access.MANAGEMENT_ROLES)
        if not allowed:
            raise ValidationError({"assigned_to": "Bu odam shu loyihada emas"})
    lead.assigned_to = assignee
    lead.save(update_fields=["assigned_to", "updated_at"])
    lm.LeadEvent.objects.create(lead=lead, user=by, kind="assigned",
                                text=f"Mas’ul: {assignee.full_name if assignee else 'yo‘q'}")
    if assignee and assignee != by:
        link = f"/portal/leads?lead={lead.pk}" if assignee.is_client else f"/app/leads?lead={lead.pk}"
        notify([assignee], "lead.assigned", "Sizga lid biriktirildi", body=lead_text(lead), link=link,
               payload={"lead_id": lead.pk})
    return lead


def comment(lead, text, *, by):
    _require(by, lead)
    text = (text or "").strip()
    if not text:
        raise ValidationError({"text": "Izoh bo‘sh"})
    if lead.first_response_at is None:
        lead.first_response_at = timezone.now()
        lead.save(update_fields=["first_response_at", "updated_at"])
    return lm.LeadEvent.objects.create(lead=lead, user=by, kind="comment", text=text[:500])


def schedule(lead, when, *, by):
    _require(by, lead)
    lead.next_contact_at = when
    lead.save(update_fields=["next_contact_at", "updated_at"])
    lm.LeadEvent.objects.create(lead=lead, user=by, kind="reminder",
                                text=f"Qayta bog‘lanish: {timezone.localtime(when):%d.%m.%Y %H:%M}" if when
                                else "Eslatma olib tashlandi")
    return lead


def counted(qs):
    """Reklama natijasiga kiradigan lidlar: takror va spam hisoblanmaydi."""
    return qs.filter(duplicate_of__isnull=True).exclude(status=lm.SPAM)


def real_lead_count(project, begin, end):
    return counted(lm.Lead.objects.filter(project=project, created_at__date__range=(begin, end))).count()


def stats(qs, today=None):
    today = today or timezone.localdate()
    base = qs.filter(duplicate_of__isnull=True)
    counts = Counter(dict(base.values_list("status").annotate(n=Count("id"))))
    real = base.exclude(status=lm.SPAM)
    sales = {row["sale_currency"]: str(row["s"]) for row in real.filter(status=lm.WON, sale_amount__isnull=False)
             .values("sale_currency").annotate(s=Sum("sale_amount"))}
    return {
        **funnel(counts),
        "by_status": dict(counts),
        "today": real.filter(created_at__date=today).count(),
        "week": real.filter(created_at__date__gte=today - timedelta(days=6)).count(),
        "unanswered": real.filter(status=lm.NEW).count(),
        "sales": sales,
    }
