"""Bildirishnomalar. Panelda ko'rinadi; Telegram ulagan foydalanuvchiga bot ham yuboradi (apps.telegram)."""
from apps.notifications.models import Notification


def notify(users, kind, title, body="", link="", payload=None, dedupe_key=""):
    """dedupe_key berilsa, bir foydalanuvchiga shu kalit bilan faqat bir marta yuboriladi (eslatmalar uchun)."""
    seen = set()
    if dedupe_key:
        seen = set(Notification.objects.filter(dedupe_key=dedupe_key).values_list("user_id", flat=True))
    rows = []
    for user in users:
        if user is None or user.pk in seen or not user.is_active:
            continue
        seen.add(user.pk)
        rows.append(Notification(user=user, kind=kind, title=title[:200], body=body, link=link,
                                 payload=payload or {}, dedupe_key=dedupe_key))
    Notification.objects.bulk_create(rows, ignore_conflicts=bool(dedupe_key))
    return rows


def project_smm_managers(project):
    from apps.accounts.models import Position

    return [a.user for a in project.assignments.select_related("user").filter(position__code=Position.SMM_TARGET,
                                                                                ended_at__isnull=True)]


def project_client_users(project):
    return [m.user for m in project.client.memberships.select_related("user")]
