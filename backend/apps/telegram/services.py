"""Telegram bot uchun biznes mantiq. Bot bazaga kirmaydi — faqat shu funksiyalar ortidagi API orqali ishlaydi."""
from collections import Counter
from datetime import timedelta
from html import escape

from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.accounts.models import User
from apps.clients.selectors import visible_projects
from apps.content import models as cm
from apps.finance.models import Invoice
from apps.notifications.models import Notification
from apps.notifications.services import notify
from apps.tasks import models as tm
from apps.telegram.models import TelegramLinkToken
from apps.worklog import models as wl
from common import access
from common.money import q

OUTBOX_MAX_AGE = timedelta(days=2)


# ---------- Akkauntni ulash ----------

def create_link(user):
    if not settings.TELEGRAM_BOT_USERNAME:
        raise ValidationError({"detail": "Bot hali sozlanmagan (TELEGRAM_BOT_USERNAME)."})
    TelegramLinkToken.objects.filter(user=user, used_at__isnull=True).delete()
    link = TelegramLinkToken.objects.create(user=user)
    return {"url": f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={link.token}", "expires_at": link.expires_at}


@transaction.atomic
def confirm_link(token, chat_id, username=""):
    link = TelegramLinkToken.objects.select_related("user").select_for_update().filter(token=token).first()
    if link is None or not link.is_usable or not link.user.is_active:
        raise ValidationError({"detail": "Havola eskirgan. Paneldan qaytadan «Telegram’ni ulash» tugmasini bosing."})
    # Bitta Telegram akkaunti faqat bitta foydalanuvchiga ulanadi.
    User.objects.filter(telegram_chat_id=chat_id).exclude(pk=link.user_id).update(
        telegram_chat_id=None, telegram_username="", telegram_linked_at=None)
    user = link.user
    user.telegram_chat_id = chat_id
    user.telegram_username = (username or "")[:64]
    user.telegram_linked_at = timezone.now()
    user.save(update_fields=["telegram_chat_id", "telegram_username", "telegram_linked_at"])
    link.used_at = timezone.now()
    link.save(update_fields=["used_at"])
    return user


def unlink(user):
    user.telegram_chat_id = None
    user.telegram_username = ""
    user.telegram_linked_at = None
    user.save(update_fields=["telegram_chat_id", "telegram_username", "telegram_linked_at"])


def user_by_chat(chat_id):
    user = User.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if user is None:
        raise NotFound("Akkaunt ulanmagan. Paneldagi «Telegram’ni ulash» tugmasidan foydalaning.")
    return user


# ---------- Xabarlar navbati ----------

def _panel_url(link):
    base = settings.FRONTEND_URL.rstrip("/")
    # Telegram tugmasi faqat haqiqiy https manzilni qabul qiladi (localhost'ni rad etadi).
    return f"{base}{link}" if link and base.startswith("https://") else None


def render(notification):
    """Bildirishnomani bot yuboradigan ko'rinishga keltiradi: HTML matn va tugmalar."""
    lines = [f"<b>{escape(notification.title)}</b>"]
    if notification.body:
        lines.append(escape(notification.body))
    buttons = []
    item_id = (notification.payload or {}).get("item_id")
    if notification.kind == "content.review" and item_id:
        buttons.append([{"text": "✅ Tasdiqlayman", "callback": f"ap:{item_id}"},
                        {"text": "✍️ Izoh qoldirish", "callback": f"ch:{item_id}"}])
    url = _panel_url(notification.link)
    if url:
        buttons.append([{"text": "Panelda ochish", "url": url}])
    return {"id": notification.pk, "chat_id": notification.user.telegram_chat_id, "text": "\n".join(lines),
            "buttons": buttons}


def outbox(limit=50):
    since = timezone.now() - OUTBOX_MAX_AGE
    qs = (Notification.objects.select_related("user")
          .filter(telegram_sent_at__isnull=True, user__is_active=True, user__telegram_chat_id__isnull=False,
                  created_at__gte=since)
          # Ulanishdan oldingi eski xabarlar botga yuborilmaydi.
          .filter(created_at__gte=F("user__telegram_linked_at"))
          .order_by("created_at")[:limit])
    return [render(n) for n in qs]


def ack(ids):
    pending = Notification.objects.filter(pk__in=ids, telegram_sent_at__isnull=True)
    return pending.update(telegram_sent_at=timezone.now())


# ---------- Rejali xabarlar ----------

def morning_digest(today=None):
    """Har kuni ertalab rahbarlarga: qarz, tasdiq kutayotganlar, muddati o'tgan vazifalar."""
    today = today or timezone.localdate()
    open_invoices = [inv for inv in Invoice.objects.filter(issued_at__isnull=False, cancelled_at__isnull=True)
                     if inv.outstanding > 0]
    overdue = [inv for inv in open_invoices if inv.due_date < today]
    debt = Counter()
    for inv in overdue:
        debt[inv.currency] += inv.outstanding
    review = cm.ContentItem.objects.filter(status=cm.CLIENT_REVIEW).count()
    late_tasks = tm.Task.objects.filter(status__in=[tm.TODO, tm.IN_PROGRESS], due_date__lt=today).count()
    pending_log = wl.WorkLogEntry.objects.filter(status=wl.SUBMITTED).count()
    lines = [
        f"Muddati o‘tgan to‘lovlar: {len(overdue)}"
        + (" (" + ", ".join(f"{q(v)} {c}" for c, v in debt.items()) + ")" if debt else ""),
        f"Mijoz tasdig‘ida: {review}",
        f"Muddati o‘tgan vazifalar: {late_tasks}",
        f"Tekshiruv kutayotgan jurnal yozuvlari: {pending_log}",
    ]
    managers = User.objects.filter(role__in=access.MANAGEMENT_ROLES, is_active=True, telegram_chat_id__isnull=False)
    return notify(managers, "digest.morning", f"Xayrli tong! {today:%d.%m.%Y} holati", body="\n".join(lines),
                  link="/app")


def evening_reminders(today=None):
    """Kechqurun: bugun jurnalga hech narsa yozmagan jamoa a'zolariga eslatma."""
    today = today or timezone.localdate()
    staff = (User.objects.filter(role__in=[access.SMM, access.CREATOR], is_active=True,
                                 telegram_chat_id__isnull=False, assignments__ended_at__isnull=True)
             .exclude(worklog__date=today).distinct())
    return notify(staff, "worklog.reminder", "Bugungi ish jurnalingiz bo‘sh",
                  body="Bugun nima qildingiz? /jurnal buyrug‘i bilan 1 daqiqada yozib qo‘ying.", link="/app/worklog")


# ---------- Bot buyruqlari (foydalanuvchi nomidan) ----------

def my_tasks(user, today=None):
    today = today or timezone.localdate()
    qs = (tm.Task.objects.select_related("project__client")
          .filter(assignee=user, status__in=[tm.TODO, tm.IN_PROGRESS], project__in=visible_projects(user))
          .filter(Q(due_date__isnull=True) | Q(due_date__lte=today + timedelta(days=3)))
          .order_by("due_date", "id")[:20])
    return [{"id": t.id, "title": t.title, "client": t.project.client.name, "due_date": t.due_date,
             "overdue": bool(t.due_date and t.due_date < today)} for t in qs]


def my_projects(user):
    return [{"id": p.id, "client": p.client.name, "tariff": p.tariff_version.tariff.name}
            for p in visible_projects(user).filter(status="active")]


def add_worklog(user, *, project_id, kind, title, quantity=1):
    if not user.has_obro_perm(access.WORKLOG_CREATE):
        raise ValidationError({"detail": "Jurnalga yozish huquqi yo‘q"})
    project = visible_projects(user).filter(pk=project_id).first()
    if project is None:
        raise ValidationError({"project": "Bu loyiha sizga biriktirilmagan"})
    if kind not in dict(wl.KIND_CHOICES):
        kind = "other"
    title = (title or "").strip()
    if not title:
        raise ValidationError({"title": "Nima qilinganini yozing"})
    approved = user.has_obro_perm(access.WORKLOG_APPROVE)
    return wl.WorkLogEntry.objects.create(
        user=user, project=project, date=timezone.localdate(), kind=kind, quantity=max(int(quantity or 1), 1),
        title=title[:255], source=wl.SOURCE_BOT, status=wl.APPROVED if approved else wl.SUBMITTED,
        approved_at=timezone.now() if approved else None,
    )


def client_item(user, item_id):
    """Mijoz faqat o'z kompaniyasiga yuborilgan kontentni ko'radi."""
    item = (cm.ContentItem.objects.select_related("project__client")
            .filter(pk=item_id, project__client__memberships__user=user).first())
    if item is None:
        raise NotFound("Kontent topilmadi")
    return item
