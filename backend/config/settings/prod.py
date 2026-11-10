from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, env_bool

DEBUG = False
if SECRET_KEY.startswith("dev-only"):
    raise RuntimeError("DJANGO_SECRET_KEY serverda albatta berilishi kerak")

# Domen va SSL sertifikati bo'lmaguncha (IP orqali sinov) HTTPS_ENABLED=0 qo'yiladi.
HTTPS_ENABLED = env_bool("HTTPS_ENABLED", True)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = HTTPS_ENABLED and env_bool("SECURE_SSL_REDIRECT", True)
# Bot API faqat serverning ichidan (127.0.0.1) chaqiriladi va maxfiy kalit bilan himoyalangan.
SECURE_REDIRECT_EXEMPT = [r"^api/v1/bot/"]
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30 if HTTPS_ENABLED else 0
# Pochta kabi boshqa subdomenlar HTTPS'siz bo'lishi mumkin: ularni majburlamaymiz.
SECURE_HSTS_INCLUDE_SUBDOMAINS = HTTPS_ENABLED and env_bool("HSTS_INCLUDE_SUBDOMAINS", False)
SESSION_COOKIE_SECURE = HTTPS_ENABLED
CSRF_COOKIE_SECURE = HTTPS_ENABLED
REFRESH_COOKIE_SECURE = HTTPS_ENABLED
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
}
