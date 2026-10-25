"""Bot sozlamalari: bot/.env faylidan yoki muhit o'zgaruvchilaridan."""
import os
from dataclasses import dataclass
from datetime import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _time(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


@dataclass(frozen=True)
class Config:
    token: str
    api_url: str
    api_secret: str
    outbox_interval: int
    morning_at: time
    evening_at: time
    timezone: str


def load() -> Config:
    _load_dotenv(BASE_DIR / ".env")
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    secret = os.environ.get("TELEGRAM_BOT_API_SECRET", "")
    if not token or not secret:
        raise SystemExit("bot/.env da TELEGRAM_BOT_TOKEN va TELEGRAM_BOT_API_SECRET bo‘lishi kerak "
                         "(.env.example’ga qarang)")
    return Config(
        token=token,
        api_url=os.environ.get("API_URL", "http://127.0.0.1:8000/api/v1").rstrip("/"),
        api_secret=secret,
        outbox_interval=int(os.environ.get("OUTBOX_INTERVAL", "10")),
        morning_at=_time(os.environ.get("MORNING_AT", "09:00")),
        evening_at=_time(os.environ.get("EVENING_AT", "18:30")),
        timezone=os.environ.get("TIMEZONE", "Asia/Tashkent"),
    )
