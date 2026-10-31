"""Harakatlar jurnali: tizimga kirgan odamning har bir o'zgartirishi yoziladi.

Pul va ruxsat kabi muhim amallar o'zi batafsil yozadi (common.audit.log). Qolgan hamma so'rovni shu middleware
ushlaydi, shuning uchun yangi bo'lim qo'shilsa ham jurnaldan tushib qolmaydi. So'rov tanasi saqlanmaydi: parol va
token jurnalga kirmasin.
"""
import logging
import re
from contextvars import ContextVar

logger = logging.getLogger(__name__)

logged_in_request: ContextVar[bool] = ContextVar("audit_logged", default=False)

API_PREFIX = "/api/v1/"
SKIP = ("auth/", "bot/", "leads/hook/", "telegram/", "notifications/", "files/")

RESOURCES = {
    "content/items": "Kontent", "content/briefs": "TZ", "content/shoot-days": "Syomka",
    "tasks": "Vazifa", "worklog": "Ish jurnali",
    "leads/items": "Lid", "leads/sources": "Lid manbasi",
    "clients": "Mijoz", "client-contacts": "Mijoz kontakti", "social-accounts": "Ijtimoiy tarmoq",
    "client-members": "Kabinet a’zosi", "projects": "Loyiha", "assignments": "Biriktirish",
    "users": "Xodim", "positions": "Lavozim", "invites": "Taklif",
    "catalog/tariffs": "Tarif", "catalog/tariff-versions": "Tarif versiyasi", "catalog/services": "Xizmat",
    "metrics/snapshots": "Ko‘rsatkich", "metrics/content": "Kontent ko‘rsatkichi",
    "ads/campaigns": "Reklama kampaniyasi", "ads/stats": "Reklama natijasi",
    "finance/rates": "Kurs", "finance/accounts": "Hisob", "finance/invoices": "Hisob-faktura",
    "finance/payments": "To‘lov", "finance/expense-categories": "Xarajat kategoriyasi",
    "finance/expenses": "Xarajat", "finance/transfers": "O‘tkazma", "finance/partners": "Sherik",
    "finance/withdrawals": "Sherik olgan pul", "finance/recurring": "Takroriy xarajat",
    "payroll/rules": "Foiz qoidasi", "payroll/adjustments": "Maosh tuzatishi", "payroll/payouts": "Maosh to‘lovi",
    "payroll/sheet": "Vedomost",
    "portal/approvals": "Mijoz tasdig‘i", "portal/requests": "Mijoz so‘rovi", "portal/leads": "Lid (mijoz)",
    "portal/shoots": "Syomka (mijoz)",
}

VERBS = {"POST": "qo‘shdi", "PUT": "o‘zgartirdi", "PATCH": "o‘zgartirdi", "DELETE": "o‘chirdi"}

ACTIONS = {
    "approve": "tasdiqladi", "reject": "rad etdi", "send": "yubordi", "accept": "qabul qildi", "submit": "topshirdi",
    "return": "qaytardi", "cancel": "bekor qildi", "complete": "yakunladi", "confirm": "tasdiqladi",
    "set-status": "holatini o‘zgartirdi", "assign": "mas’ul belgiladi", "comment": "izoh yozdi",
    "schedule": "eslatma qo‘ydi", "test": "sinovdan o‘tkazdi", "shot": "kadrni belgiladi", "publish": "joyladi",
    "versions": "yangi versiya yukladi", "comments": "izoh yozdi", "issue": "chiqardi", "remind": "eslatma yubordi",
}

# Jurnaldagi bo'limlar: ham batafsil yozuv (finance.Payment), ham umumiy yozuv (finance/payments) shu boshlanmalar.
SECTIONS = {
    "finance": ("Moliya", ("finance",)),
    "payroll": ("Maosh", ("payroll",)),
    "clients": ("Mijozlar", ("clients", "client-", "social-", "projects", "assignments")),
    "content": ("Kontent", ("content",)),
    "tasks": ("Vazifalar", ("tasks", "worklog")),
    "leads": ("Lidlar", ("leads",)),
    "team": ("Jamoa", ("accounts", "users", "positions", "invites")),
    "catalog": ("Tariflar", ("catalog",)),
    "metrics": ("Ko‘rsatkichlar", ("metrics", "ads")),
    "portal": ("Mijoz kabineti", ("portal",)),
}


def section_of(entity_type):
    for key, (label, prefixes) in SECTIONS.items():
        if entity_type.startswith(prefixes):
            return key, label
    return "other", "Boshqa"


def describe(method, path):
    """/api/v1/content/briefs/5/send/ → (content/briefs, 5, «TZ», «yubordi»). Tanilmasa None."""
    rest = path[len(API_PREFIX):].strip("/")
    for key in sorted(RESOURCES, key=len, reverse=True):
        if rest == key or rest.startswith(key + "/"):
            tail = [part for part in rest[len(key):].split("/") if part]
            entity_id = tail.pop(0) if tail and re.fullmatch(r"\d+", tail[0]) else ""
            word = ACTIONS.get(tail[0], tail[0].replace("-", " ")) if tail else VERBS.get(method, "o‘zgartirdi")
            return key, entity_id, RESOURCES[key], word
    return None


def _name_of(response):
    data = getattr(response, "data", None)
    if isinstance(data, dict):
        for key in ("title", "name", "full_name", "client_name", "description"):
            if isinstance(data.get(key), str) and data[key]:
                return data[key][:80]
    return ""


class ActivityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = logged_in_request.set(False)
        response = self.get_response(request)
        try:
            self._record(request, response)
        except Exception:
            # Jurnal xatosi foydalanuvchi ishini to'xtatmasligi kerak.
            logger.exception("Harakat yozilmadi: %s", request.path)
        finally:
            logged_in_request.reset(token)
        return response

    def _record(self, request, response):
        if request.method not in VERBS or response.status_code >= 400 or not request.path.startswith(API_PREFIX):
            return
        if logged_in_request.get() or request.path[len(API_PREFIX):].startswith(SKIP):
            return
        user = getattr(request, "user", None)
        if not getattr(user, "is_authenticated", False):
            return
        found = describe(request.method, request.path)
        if found is None:
            return
        from apps.core.models import AuditLog

        key, entity_id, resource, word = found
        name = _name_of(response)
        comment = f"{resource}{f' «{name}»' if name else ''}: {word}"
        AuditLog.objects.create(actor=user, action=f"api.{request.method.lower()}", entity_type=key[:60],
                                entity_id=entity_id, comment=comment[:255])
