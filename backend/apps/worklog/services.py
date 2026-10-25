from django.utils import timezone

from apps.worklog import models as wl


def auto_entry(*, user, project, kind, title, content_item=None, task=None, quantity=1, approved=True):
    """Tizim o'zi yozadigan jurnal yozuvi (vazifa bajarildi, versiya yuklandi, joylandi)."""
    now = timezone.now()
    return wl.WorkLogEntry.objects.create(
        user=user,
        project=project,
        date=timezone.localdate(),
        kind=kind,
        quantity=quantity,
        title=title[:255],
        source=wl.SOURCE_AUTO,
        status=wl.APPROVED if approved else wl.SUBMITTED,
        approved_at=now if approved else None,
        content_item=content_item,
        task=task,
    )


def review(entry, *, by, approve: bool, client_visible=None):
    entry.status = wl.APPROVED if approve else wl.REJECTED
    entry.approved_by = by
    entry.approved_at = timezone.now()
    if client_visible is not None:
        entry.client_visible = client_visible
    entry.save(update_fields=["status", "approved_by", "approved_at", "client_visible"])
    return entry
