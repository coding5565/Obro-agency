from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, env_bool

DEBUG = False
if SECRET_KEY.startswith("dev-only"):
    raise RuntimeError("DJANGO_SECRET_KEY serverda albatta berilishi kerak")

# Domen va SSL sertifikati bo'lmaguncha (IP orqali sinov) HTTPS_ENABLED=0 qo'yiladi.
HTTPS_ENABLED = env_bool("HTTPS_ENABLED", True)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = HTTPS_ENABLED and env_bool("SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30 if HTTPS_ENABLED else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = HTTPS_ENABLED
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
