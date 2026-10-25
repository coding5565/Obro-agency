from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.tasks import models as tm
from apps.worklog.services import auto_entry
from common import access

# Vazifa lavozimi → jurnal yozuvi turi
POSITION_KIND = {"smm_target": "script", "video_mobilo": "shooting", "design_montage": "editing"}


def set_task_status(task, new_status, *, by):
    """Vazifa holatini o'zgartiradi. «Bajarildi» bo'lganda jurnalga o'zi yozuv qo'shiladi."""
    if new_status not in dict(tm.Task.STATUS_CHOICES):
        raise ValidationError({"status": "Noto‘g‘ri holat"})
    if task.assignee_id not in (by.id, None) and not by.has_obro_perm(access.TASKS_MANAGE):
        raise ValidationError({"status": "Bu vazifa sizga berilmagan"})
    if new_status == tm.DONE and task.status != tm.DONE:
        task.completed_at = timezone.now()
        if task.assignee_id is None:
            task.assignee = by
        kind = POSITION_KIND.get(task.position.code if task.position else "", "other")
        # Ish turi alohida ko'rsatiladi, sarlavhada faqat «nima ustida» qolsin.
        item = task.content_item
        title = f"{item.get_kind_display()} «{item.title}»" if item else task.title
        auto_entry(user=by, project=task.project, kind=kind, title=title, content_item=item, task=task)
    task.status = new_status
    task.save(update_fields=["status", "completed_at", "assignee"])
    return task
