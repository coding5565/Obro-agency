"""Syomka kunlari: bandlik to'qnashuvi, ishtirokchilar va mijozga xabarlar."""
from datetime import datetime, time, timedelta

from django.utils import timezone

from apps.content.models import ShootDay
from apps.notifications.services import notify, project_client_users, project_smm_managers

DEFAULT_START = time(9, 0)
DEFAULT_LENGTH = timedelta(hours=3)


def start_of(shoot):
    return timezone.make_aware(datetime.combine(shoot.date, shoot.start_time or DEFAULT_START))


def span(shoot):
    begin = start_of(shoot)
    if not shoot.end_time:
        return begin, begin + DEFAULT_LENGTH
    return begin, max(timezone.make_aware(datetime.combine(shoot.date, shoot.end_time)), begin + timedelta(minutes=1))


def when_text(shoot):
    time_part = f" {shoot.start_time:%H:%M}" if shoot.start_time else ""
    place = f" · {shoot.location}" if shoot.location else ""
    return f"{shoot.date:%d.%m.%Y}{time_part}{place}"


def conflicts(shoot):
    """Shu kuni shu ishtirokchilar boshqa syomkada bandmi. Vaqtlar kesishsa — ogohlantirish, taqiq emas."""
    people = set(shoot.participants.values_list("pk", flat=True))
    if not people or shoot.status == "cancelled":
        return []
    begin, end = span(shoot)
    result = []
    others = (ShootDay.objects.filter(date=shoot.date, participants__in=people).exclude(pk=shoot.pk)
              .exclude(status="cancelled").select_related("project__client").distinct())
    for other in others:
        other_begin, other_end = span(other)
        if begin < other_end and other_begin < end:
            names = other.participants.filter(pk__in=people).values_list("full_name", flat=True)
            result.append({"shoot": other.pk, "client": other.project.client.name, "when": when_text(other),
                           "people": list(names)})
    return result


def _team(shoot):
    return [*shoot.participants.all(), *project_smm_managers(shoot.project)]


def _client_body(shoot):
    return when_text(shoot) + (f"\nTayyorlab qo‘ying: {shoot.client_prep}" if shoot.client_prep else "")


def announce_created(shoot):
    notify(_team(shoot), "shoot.new", f"Yangi syomka: {shoot.project.client.name}", body=when_text(shoot),
           link="/app/schedule")
    notify(project_client_users(shoot.project), "shoot.confirm", "Syomka rejalashtirildi", body=_client_body(shoot),
           link="/portal/shoots", payload={"shoot_id": shoot.pk})


def announce_changed(shoot):
    """Vaqt yoki joy o'zgarsa mijoz tasdig'i qaytadan so'raladi."""
    shoot.client_confirmed_at = None
    shoot.save(update_fields=["client_confirmed_at"])
    notify(_team(shoot), "shoot.moved", f"Syomka o‘zgardi: {shoot.project.client.name}", body=when_text(shoot),
           link="/app/schedule")
    notify(project_client_users(shoot.project), "shoot.confirm", "Syomka vaqti o‘zgardi", body=_client_body(shoot),
           link="/portal/shoots", payload={"shoot_id": shoot.pk})


def announce_cancelled(shoot):
    notify(_team(shoot), "shoot.cancelled", f"Syomka bekor qilindi: {shoot.project.client.name}",
           body=when_text(shoot), link="/app/schedule")
    notify(project_client_users(shoot.project), "shoot.cancelled", "Syomka bekor qilindi", body=when_text(shoot),
           link="/portal/shoots")


def client_confirm(shoot, *, by):
    if shoot.client_confirmed_at is None:
        shoot.client_confirmed_at = timezone.now()
        shoot.save(update_fields=["client_confirmed_at"])
        notify(project_smm_managers(shoot.project), "shoot.client_ok",
               f"Mijoz syomkani tasdiqladi: {shoot.project.client.name}", body=when_text(shoot), link="/app/schedule")
    return shoot
