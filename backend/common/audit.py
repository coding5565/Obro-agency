from decimal import Decimal

from django.db.models.fields.files import FieldFile
from django.forms.models import model_to_dict


def snapshot(instance, fields=None) -> dict:
    """Modelni audit uchun JSON'ga yaroqli lug'atga aylantiradi."""
    data = model_to_dict(instance, fields=fields)
    return {key: _jsonable(value) for key, value in data.items()}


def _jsonable(value):
    if isinstance(value, FieldFile):
        return value.name or None
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "pk"):
        return value.pk
    return value


def log(actor, action, instance, *, before=None, after=None, comment=""):
    from apps.core.models import AuditLog

    AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        entity_type=instance._meta.label,
        entity_id=str(instance.pk),
        before=before,
        after=after,
        comment=comment[:255],
    )
