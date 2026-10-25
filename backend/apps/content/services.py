"""Kontent oqimi: reja → … → ichki tekshiruv → mijoz tasdig'i → joylandi."""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Position
from apps.content import models as cm
from apps.notifications.services import notify, project_client_users, project_smm_managers
from apps.tasks.models import Task
from apps.worklog.services import auto_entry

# Kontent rejaga qo'shilganda avtomatik yaratiladigan vazifalar: (lavozim, sarlavha qo'shimchasi)
DEFAULT_TASKS = {
    "reels": [(Position.SMM_TARGET, "Ssenariy"), (Position.VIDEO_MOBILO, "Suratga olish"),
              (Position.DESIGN_MONTAGE, "Montaj va cover")],
    "video": [(Position.SMM_TARGET, "Ssenariy"), (Position.VIDEO_MOBILO, "Suratga olish"),
              (Position.DESIGN_MONTAGE, "Montaj")],
    "post": [(Position.SMM_TARGET, "Matn"), (Position.DESIGN_MONTAGE, "Dizayn")],
    "stories": [(Position.SMM_TARGET, "Stories")],
}


def _assignee_for(project, position_code):
    assignment = (project.assignments.select_related("user", "position")
                  .filter(position__code=position_code, ended_at__isnull=True).first())
    if assignment:
        return assignment.user, assignment.position
    return None, Position.objects.filter(code=position_code).first()


@transaction.atomic
def create_item(*, project, by, create_tasks=True, **fields):
    item = cm.ContentItem.objects.create(project=project, created_by=by, **fields)
    if create_tasks:
        for position_code, label in DEFAULT_TASKS.get(item.kind, []):
            user, position = _assignee_for(project, position_code)
            Task.objects.create(
                project=project, content_item=item, title=f"{label}: {item.title}"[:200],
                assignee=user, position=position, due_date=item.planned_date, created_by=by,
            )
    return item


def set_status(item, new_status, *, by):
    allowed = cm.STAFF_TRANSITIONS.get(item.status, set())
    if new_status not in allowed:
        raise ValidationError({"status": f"«{item.get_status_display()}» holatidan bu holatga o‘tib bo‘lmaydi"})
    item.status = new_status
    item.save(update_fields=["status", "updated_at"])
    return item


@transaction.atomic
def add_version(item, *, by, file=None, link="", note=""):
    if not file and not link:
        raise ValidationError({"file": "Fayl yoki havola kerak"})
    if item.status in (cm.PUBLISHED, cm.CANCELLED):
        raise ValidationError({"status": "Joylangan yoki bekor qilingan kontentga versiya qo‘shilmaydi"})
    number = (item.versions.order_by("-number").values_list("number", flat=True).first() or 0) + 1
    version = cm.ContentVersion.objects.create(item=item, number=number, file=file or "", link=link, note=note,
                                               uploaded_by=by)
    if item.status in (cm.IDEA, cm.SCRIPT, cm.SHOOTING, cm.EDITING, cm.CHANGES):
        item.status = cm.INTERNAL_REVIEW
        item.save(update_fields=["status", "updated_at"])
    kind = "design" if item.kind in ("post", "stories") else "editing"
    auto_entry(user=by, project=item.project, kind=kind,
               title=f"{item.get_kind_display()} «{item.title}» — v{number} tayyorlandi", content_item=item)
    notify(project_smm_managers(item.project), "content.version", f"Tekshiring: {item.title} (v{number})",
           link=f"/app/content/{item.pk}")
    return version


@transaction.atomic
def send_to_client(item, *, by):
    version = item.latest_version
    if version is None:
        raise ValidationError({"version": "Avval versiya yuklang"})
    if item.status not in (cm.INTERNAL_REVIEW, cm.CHANGES):
        raise ValidationError({"status": "Faqat ichki tekshiruvdan o‘tgan kontent mijozga yuboriladi"})
    version.client_visible = True
    version.save(update_fields=["client_visible"])
    item.status = cm.CLIENT_REVIEW
    item.save(update_fields=["status", "updated_at"])
    notify(project_client_users(item.project), "content.review", f"Tasdiqlash kutmoqda: {item.title}",
           link=f"/portal/approvals/{item.pk}")
    return item


@transaction.atomic
def client_decide(item, *, by, approve: bool, comment="", timecode=""):
    if item.status != cm.CLIENT_REVIEW:
        raise ValidationError({"status": "Bu kontent hozir tasdiq kutmayapti"})
    version = item.versions.filter(client_visible=True).order_by("-number").first()
    if not approve and not comment.strip():
        raise ValidationError({"comment": "Nimani o‘zgartirish kerakligini yozing"})
    cm.Approval.objects.create(version=version, decision=cm.Approval.APPROVED if approve else cm.Approval.CHANGES,
                               comment=comment, timecode=timecode, decided_by=by)
    if approve:
        item.status = cm.APPROVED
        title = f"Mijoz tasdiqladi: {item.title}"
    else:
        item.status = cm.CHANGES
        item.revisions_used += 1
        title = f"Mijoz tuzatish so‘radi: {item.title}"
    item.save(update_fields=["status", "revisions_used", "updated_at"])
    team = [a.user for a in item.project.assignments.select_related("user").filter(ended_at__isnull=True)]
    notify(team, "content.decision", title, body=comment, link=f"/app/content/{item.pk}")
    return item


@transaction.atomic
def publish(item, *, by, url=""):
    # Stories mijoz tasdig'isiz ham joylanadi, qolgan turlar faqat tasdiqdan keyin.
    can_skip_client = item.kind == "stories" and item.status in (cm.IDEA, cm.EDITING, cm.INTERNAL_REVIEW)
    if item.status != cm.APPROVED and not can_skip_client:
        raise ValidationError({"status": "Avval mijoz tasdiqlashi kerak"})
    item.status = cm.PUBLISHED
    item.published_at = timezone.now()
    item.published_url = url
    item.save(update_fields=["status", "published_at", "published_url", "updated_at"])
    auto_entry(user=by, project=item.project, kind="publishing",
               title=f"{item.get_kind_display()} «{item.title}»", content_item=item)
    return item


def revisions_left(item):
    limit = item.project.tariff_version.revisions_per_item
    return max(limit - item.revisions_used, 0)
