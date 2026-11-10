"""Bot mehmonlari: raqam bilan kirish, tariflar, aloqa va ariza (potensial mijoz sifatida CRM'ga tushadi)."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.accounts.models import User, normalize_phone
from apps.catalog.models import Tariff
from apps.clients.models import Client, ClientContact
from apps.notifications.services import notify
from common import access, audit

KIND = {"post": "post", "stories": "Stories", "reels": "Reels", "video": "video"}
CONTACT = ("<b>OBRO AGENCY</b> · SMM agentlik, Farg‘ona\n\n"
           "📞 +998 93 644 40 39\n"
           "✈️ Telegram: @im_ibrokhimov\n"
           "📷 Instagram: @obroagency\n"
           "🌐 obroagency.uz\n"
           "📍 C-space coworking, Farg‘ona")


@transaction.atomic
def link_by_phone(chat_id, phone, username=""):
    """Telegram tasdiqlagan raqam tizimdagi akkauntga mos kelsa, bot shu akkauntga ulanadi."""
    user = User.objects.select_for_update().filter(phone=normalize_phone(phone), is_active=True).first()
    if user is None:
        raise NotFound("Bu raqam bilan akkaunt topilmadi.")
    # Bitta Telegram faqat bitta akkauntga ulanadi.
    User.objects.filter(telegram_chat_id=chat_id).exclude(pk=user.pk).update(
        telegram_chat_id=None, telegram_username="", telegram_linked_at=None)
    user.telegram_chat_id = chat_id
    user.telegram_username = (username or "")[:64]
    user.telegram_linked_at = timezone.now()
    user.save(update_fields=["telegram_chat_id", "telegram_username", "telegram_linked_at"])
    audit.log(user, "telegram.link", user, comment="Raqam orqali")
    return user


def tariffs_text():
    today = timezone.localdate()
    lines = ["<b>Oylik paketlar</b>", ""]
    for tariff in Tariff.objects.filter(is_active=True).order_by("sort"):
        version = tariff.current_version(today)
        if version is None:
            continue
        limits = ", ".join(f"{qty} {KIND.get(kind, kind)}" for kind, qty in version.limit_map().items())
        price = f"${int(version.price)}" if version.currency == "USD" else f"{int(version.price):,} so‘m"
        bonus = " · bonus: studiya" if "studiya" in tariff.description.lower() else ""
        lines.append(f"<b>{tariff.name}</b> — {price} / oy\n{limits}{bonus}")
    lines += ["", "Barcha tariflarda CRM kabinet: ish va hisobotlarni shu bot va kabinetda ko‘rib turasiz.",
              "Target reklama budjeti narxga kirmaydi va alohida kelishiladi."]
    return "\n".join(lines)


def create_request(*, chat_id, full_name, business, phone, username=""):
    """Bot orqali ariza: potensial mijoz bo'lib tushadi, rahbarlarga xabar boradi. Bir kunda bir marta."""
    phone = normalize_phone(phone)
    full_name, business = (full_name or "").strip()[:150], (business or "").strip()[:150]
    if len(phone) < 12 or not full_name:
        raise ValidationError({"detail": "Ism va telefon raqamini to‘g‘ri yozing."})
    recent = ClientContact.objects.filter(phone=phone, client__status="lead",
                                          client__created_at__gte=timezone.now() - timedelta(days=1)).first()
    if recent:
        return recent.client, False
    with transaction.atomic():
        client = Client.objects.create(
            name=business or full_name, status="lead", source="Telegram bot",
            notes=f"Botdan ariza. Telegram: @{username}" if username else "Botdan ariza.",
        )
        ClientContact.objects.create(client=client, full_name=full_name, phone=phone, is_primary=True)
    managers = User.objects.filter(role__in=access.MANAGEMENT_ROLES, is_active=True)
    notify(managers, "client.lead", f"Botdan yangi ariza: {client.name}", body=f"{full_name} · {phone}",
           link=f"/app/clients/{client.pk}")
    return client, True
