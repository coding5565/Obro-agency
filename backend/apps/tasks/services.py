from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.notifications.services import notify
from apps.tasks import models as tm
from apps.worklog.services import auto_entry
from common import access

# Vazifa lavozimi → jurnal yozuvi turi
POSITION_KIND = {"smm_target": "script", "video_mobilo": "shooting", "design_montage": "editing"}
LINK = "/app/tasks?task={}"


def set_task_status(task, new_status, *, by):
    """Vazifa holatini o'zgartiradi (doskada kartochkani surish ham shu).

    «Tekshiruvda» — ishchi tayyor dedi, vazifa bergan odamga xabar boradi.
    «Bajarildi» bo'lganda ijrochi nomidan jurnalga o'zi yozuv qo'shiladi.
    """
    if new_status not in dict(tm.Task.STATUS_CHOICES):
        raise ValidationError({"status": "Noto‘g‘ri holat"})
    manager = by.has_obro_perm(access.TASKS_MANAGE)
    if task.assignee_id not in (by.id, None) and not manager:
        raise ValidationError({"status": "Bu vazifa sizga berilmagan"})
    if new_status == tm.CANCELLED and not manager:
        raise ValidationError({"status": "Vazifani faqat menejer bekor qiladi"})
    old = task.status
    if old == new_status:
        return task
    if task.assignee_id is None and new_status != tm.TODO:
        task.assignee = by
    if new_status == tm.DONE:
        task.completed_at = timezone.now()
        kind = POSITION_KIND.get(task.position.code if task.position else "", "other")
        # Ish turi alohida ko'rsatiladi, sarlavhada faqat «nima ustida» qolsin.
        item = task.content_item
        title = f"{item.get_kind_display()} «{item.title}»" if item else task.title
        auto_entry(user=task.assignee or by, project=task.project, kind=kind, title=title, content_item=item, task=task)
    elif old == tm.DONE:
        task.completed_at = None
    task.status = new_status
    task.save(update_fields=["status", "completed_at", "assignee"])
    _start_content(task)
    _announce(task, old, by)
    return task


# Ishchi vazifani boshlasa, «Reja»dagi kontent o'zi jarayonga o'tadi (kalendarda sariq bo'ladi).
CONTENT_STAGE = {"smm_target": "script", "video_mobilo": "shooting", "design_montage": "editing"}


def _start_content(task):
    item = task.content_item
    if item is None or item.status != "idea" or task.status not in (tm.IN_PROGRESS, tm.REVIEW, tm.DONE):
        return
    item.status = CONTENT_STAGE.get(task.position.code if task.position else "", "script")
    item.save(update_fields=["status", "updated_at"])


def _announce(task, old, by):
    link = LINK.format(task.pk)
    if task.status == tm.REVIEW and task.created_by_id and task.created_by_id != by.id:
        notify([task.created_by], "task.review", f"Vazifa tayyor, tekshiring: {task.title}",
               body=f"{by.full_name} · {task.project.client.name}", link=link)
    elif task.assignee_id and task.assignee_id != by.id:
        if task.status == tm.DONE:
            notify([task.assignee], "task.done", f"Vazifa qabul qilindi: {task.title}", link=link)
        elif old in (tm.REVIEW, tm.DONE) and task.status in (tm.TODO, tm.IN_PROGRESS):
            notify([task.assignee], "task.returned", f"Vazifa qaytarildi: {task.title}",
                   body="Izohlarni ko‘ring", link=link)


def announce_assigned(task, by):
    if task.assignee_id and task.assignee_id != by.id:
        due = f" · muddat {task.due_date:%d.%m}" if task.due_date else ""
        notify([task.assignee], "task.assigned", f"Sizga yangi vazifa: {task.title}",
               body=f"{task.project.client.name}{due} · {by.full_name}", link=LINK.format(task.pk))


def add_comment(task, body, *, by):
    body = (body or "").strip()
    if not body:
        raise ValidationError({"body": "Izoh bo‘sh"})
    comment = tm.TaskComment.objects.create(task=task, author=by, body=body[:4000])
    people = {u for u in (task.assignee, task.created_by) if u is not None and u.pk != by.pk}
    notify(people, "task.comment", f"Izoh: {task.title}", body=f"{by.full_name}: {body[:160]}",
           link=LINK.format(task.pk))
    return comment
