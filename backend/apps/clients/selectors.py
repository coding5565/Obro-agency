"""Kim qaysi mijoz va loyihani ko'radi. Har bir ro'yxat shu funksiyalardan boshlanadi."""
from django.db.models import Q
from django.utils import timezone

from apps.clients.models import Client, Project


def visible_projects(user):
    qs = Project.objects.select_related("client", "tariff_version__tariff")
    if not user.is_authenticated or not user.is_active:
        return qs.none()
    if user.sees_all_projects:
        return qs
    if user.is_client:
        return qs.filter(client__memberships__user=user).distinct()
    today = timezone.localdate()
    return qs.filter(
        Q(assignments__user=user),
        Q(assignments__ended_at__isnull=True) | Q(assignments__ended_at__gte=today),
    ).distinct()


def visible_clients(user):
    if not user.is_authenticated or not user.is_active:
        return Client.objects.none()
    if user.sees_all_projects:
        return Client.objects.all()
    return Client.objects.filter(projects__in=visible_projects(user)).distinct()


def client_for_portal(user, client_id=None):
    """Mijoz kabineti uchun mijoz. Bir nechta kompaniyasi bo'lsa, client_id bilan tanlanadi."""
    memberships = user.client_memberships.select_related("client")
    if client_id:
        memberships = memberships.filter(client_id=client_id)
    membership = memberships.first()
    return membership
