import dj_database_url

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
REFRESH_COOKIE_SECURE = False
# Odatda xotiradagi SQLite (tez). TEST_DATABASE_URL berilsa — haqiqiy PostgreSQL'da sinaladi.
_test_db = env("TEST_DATABASE_URL")
_sqlite_memory = {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
DATABASES = {"default": dj_database_url.parse(_test_db) if _test_db else _sqlite_memory}
# Testlar internetga chiqmaydi: cbu.uz kerak bo'lgan joyda soxta javob beriladi.
CBU_AUTO_FETCH = False
TELEGRAM_BOT_USERNAME = "obro_test_bot"
TELEGRAM_BOT_API_SECRET = "test-bot-secret-0123456789"
# Testlar tez ishlashi uchun oddiy hasher.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"login": "1000/min"}}  # noqa: F405
