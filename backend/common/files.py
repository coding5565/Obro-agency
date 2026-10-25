"""Yopiq fayllar uchun qisqa muddatli imzolangan havolalar (video <video src> da token yuborolmaydi)."""
from django.core import signing
from django.urls import reverse

FILE_LINK_MAX_AGE = 15 * 60  # 15 daqiqa
_SALT = "obro.file-link"


def signed_version_url(request, version):
    if not version.file:
        return None
    token = signing.dumps({"v": version.pk, "u": request.user.pk}, salt=_SALT)
    path = reverse("version-file", kwargs={"token": token})
    return request.build_absolute_uri(path)


def read_token(token):
    """Imzo to'g'ri va muddati o'tmagan bo'lsa {'v': version_id, 'u': user_id}, aks holda None."""
    try:
        return signing.loads(token, salt=_SALT, max_age=FILE_LINK_MAX_AGE)
    except signing.BadSignature:
        return None
