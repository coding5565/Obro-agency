from django.contrib.auth.backends import ModelBackend

from apps.accounts.models import normalize_phone


class PhoneBackend(ModelBackend):
    """Telefon raqami istalgan ko'rinishda yozilsa ham (+998 90 123-45-67) kirish ishlaydi."""

    def authenticate(self, request, phone=None, password=None, **kwargs):
        phone = phone or kwargs.get("username")
        if not phone:
            return None
        return super().authenticate(request, username=normalize_phone(phone), password=password)
