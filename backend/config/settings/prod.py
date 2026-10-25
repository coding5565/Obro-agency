from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, env_bool

DEBUG = False
if SECRET_KEY.startswith("dev-only"):
    raise RuntimeError("DJANGO_SECRET_KEY serverda albatta berilishi kerak")

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
