"""TZ oqimi: qoralama → yuborildi → ishlanmoqda → tekshiruvda → bajarildi (yoki qaytarildi)."""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.content.models import Brief
from apps.notifications.services import notify, project_smm_managers
from apps.tasks import models as tm
from apps.tasks.services import set_task_status
from apps.worklog.services import auto_entry
from common import access


def _link(brief):
    return f"/app/briefs/{brief.pk}"


def _deadline_text(brief):
    return f"Muddat: {timezone.localtime(brief.deadline):%d.%m.%Y %H:%M}" if brief.deadline else "Muddat belgilanmagan"


def _is_manager(user):
    return user.has_obro_perm(access.CONTENT_MANAGE)


def _reviewers(brief):
    return [brief.created_by, *project_smm_managers(brief.project)]


def clean_shot_list(rows):
    result = []
    for row in rows or []:
        text = (row.get("text") if isinstance(row, dict) else str(row)) or ""
        if text.strip():
            result.append({"text": text.strip()[:300], "done": bool(isinstance(row, dict) and row.get("done"))})
    return result


def send(brief, *, by):
    if brief.status not in (Brief.DRAFT, Brief.CHANGES):
        raise ValidationError({"status": "Bu TZ allaqachon yuborilgan"})
    brief.status = Brief.SENT
    brief.sent_at = timezone.now()
    brief.seen_at = None
    brief.save()
    notify([brief.assignee], "brief.sent", f"Yangi TZ: {brief.title}",
           body=f"{brief.project.client.name} · {_deadline_text(brief)}", link=_link(brief),
           payload={"brief_id": brief.pk})
    return brief


def mark_seen(brief, *, by):
    if by.pk == brief.assignee_id and brief.seen_at is None and brief.status != Brief.DRAFT:
        brief.seen_at = timezone.now()
        brief.save(update_fields=["seen_at", "updated_at"])
    return brief


def _require_assignee(brief, user):
    if user.pk != brief.assignee_id and not _is_manager(user):
        raise PermissionDenied("Bu TZ sizga berilmagan")


def accept(brief, *, by):
    _require_assignee(brief, by)
    if brief.status not in (Brief.SENT, Brief.CHANGES):
        raise ValidationError({"status": "Bu TZ qabul qilish holatida emas"})
    brief.status = Brief.IN_PROGRESS
    brief.seen_at = brief.seen_at or timezone.now()
    brief.save()
    return brief


def submit(brief, *, by):
    _require_assignee(brief, by)
    if brief.status not in Brief.OPEN:
        raise ValidationError({"status": "Bu TZ topshirish holatida emas"})
    brief.status = Brief.REVIEW
    brief.save()
    notify(_reviewers(brief), "brief.review", f"TZ tayyor, tekshiring: {brief.title}",
           body=f"{brief.assignee.full_name} · {brief.project.client.name}", link=_link(brief))
    return brief


@transaction.atomic
def approve(brief, *, by):
    if not _is_manager(by):
        raise PermissionDenied("TZ'ni faqat SMM menejer qabul qiladi")
    if brief.status != Brief.REVIEW:
        raise ValidationError({"status": "Avval ijodkor topshirishi kerak"})
    brief.status = Brief.DONE
    brief.completed_at = timezone.now()
    brief.save()
    # TZ bajarilsa, shu kontent bo'yicha ijodkorning vazifasi ham yopiladi va jurnalga yoziladi.
    tasks = []
    if brief.content_item_id:
        tasks = list(tm.Task.objects.filter(content_item=brief.content_item, assignee=brief.assignee,
                                            status__in=[tm.TODO, tm.IN_PROGRESS]))
    for task in tasks:
        set_task_status(task, tm.DONE, by=brief.assignee)
    if not tasks:
        auto_entry(user=brief.assignee, project=brief.project, kind="other", title=brief.title,
                   content_item=brief.content_item)
    notify([brief.assignee], "brief.done", f"TZ qabul qilindi: {brief.title}", link=_link(brief))
    return brief


def return_back(brief, *, by, comment):
    if not _is_manager(by):
        raise PermissionDenied("TZ'ni faqat SMM menejer qaytaradi")
    if brief.status != Brief.REVIEW:
        raise ValidationError({"status": "Faqat tekshiruvdagi TZ qaytariladi"})
    if not (comment or "").strip():
        raise ValidationError({"comment": "Nimani tuzatish kerakligini yozing"})
    brief.status = Brief.CHANGES
    brief.review_comment = comment.strip()
    brief.save()
    notify([brief.assignee], "brief.changes", f"TZ qaytarildi: {brief.title}", body=brief.review_comment,
           link=_link(brief))
    return brief


def cancel(brief, *, by):
    if not _is_manager(by):
        raise PermissionDenied("TZ'ni faqat SMM menejer bekor qiladi")
    if brief.status == Brief.DONE:
        raise ValidationError({"status": "Bajarilgan TZ bekor qilinmaydi"})
    was_sent = brief.status != Brief.DRAFT
    brief.status = Brief.CANCELLED
    brief.save()
    if was_sent:
        notify([brief.assignee], "brief.cancelled", f"TZ bekor qilindi: {brief.title}", link=_link(brief))
    return brief


def toggle_shot(brief, index, done, *, by):
    _require_assignee(brief, by)
    rows = list(brief.shot_list or [])
    if not 0 <= index < len(rows):
        raise ValidationError({"index": "Bunday kadr yo‘q"})
    rows[index] = {**rows[index], "done": bool(done)}
    brief.shot_list = rows
    brief.save(update_fields=["shot_list", "updated_at"])
    return brief
