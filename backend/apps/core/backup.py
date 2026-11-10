"""Kunlik zaxira nusxa: PostgreSQL bazasi (pg_dump) va yuklangan fayllar.

Nusxa serverda saqlanadi va Telegram orqali egasiga yuboriladi: server butunlay yo'qolsa ham nusxa qo'lda qoladi.
"""
import json
import subprocess
import tarfile
import uuid
from datetime import timedelta
from pathlib import Path
from urllib import request

from django.conf import settings
from django.utils import timezone

TELEGRAM_LIMIT = 49 * 1024 * 1024  # Bot API fayl chegarasi 50 MB


class BackupError(Exception):
    pass


def make_dump(folder: Path, stamp: str) -> Path:
    url = settings.DATABASES["default"]
    if url["ENGINE"] != "django.db.backends.postgresql":
        raise BackupError("Zaxira faqat PostgreSQL uchun")
    target = folder / f"obro-baza-{stamp}.dump"
    env = {"PGPASSWORD": str(url.get("PASSWORD") or ""), "PATH": "/usr/bin:/bin:/usr/local/bin"}
    args = ["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "-h", str(url.get("HOST") or "127.0.0.1"),
            "-p", str(url.get("PORT") or 5432), "-U", str(url["USER"]), "-f", str(target), str(url["NAME"])]
    result = subprocess.run(args, env=env, capture_output=True, text=True, timeout=600)
    if result.returncode != 0 or not target.exists() or target.stat().st_size == 0:
        raise BackupError(f"pg_dump xatosi: {result.stderr.strip()[:300]}")
    return target


def make_media(folder: Path, stamp: str) -> Path | None:
    media = Path(settings.MEDIA_ROOT)
    if not media.exists() or not any(media.rglob("*")):
        return None
    target = folder / f"obro-fayllar-{stamp}.tar.gz"
    with tarfile.open(target, "w:gz") as tar:
        tar.add(media, arcname="media")
    return target


def prune(folder: Path, keep_days: int, now=None):
    """Eski nusxalarni o'chiradi; eng oxirgi nusxa (baza va fayllar) har doim qoladi."""
    border = ((now or timezone.now()) - timedelta(days=keep_days)).timestamp()
    files = sorted(folder.glob("obro-*"), key=lambda p: p.stat().st_mtime)
    if not files:
        return []
    newest = files[-1].stat().st_mtime
    removed = []
    for path in files:
        mtime = path.stat().st_mtime
        if mtime < border and mtime < newest - 3600:
            path.unlink()
            removed.append(path.name)
    return removed


def send_telegram(token: str, chat_id: str, path: Path, caption: str):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in (("chat_id", chat_id), ("caption", caption)):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="document"; filename="{path.name}"\r\n'
                 f"Content-Type: application/octet-stream\r\n\r\n".encode())
    parts.append(path.read_bytes())
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    req = request.Request(f"https://api.telegram.org/bot{token}/sendDocument", data=b"".join(parts),
                          headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with request.urlopen(req, timeout=120) as response:
            data = json.load(response)
    except Exception as exc:  # tarmoq yoki Telegram xatosi: sabab xabarda, token emas
        raise BackupError(f"Telegram'ga yuborilmadi: {type(exc).__name__}") from None
    if not data.get("ok"):
        raise BackupError(f"Telegram'ga yuborilmadi: {data.get('description', '')[:200]}")


def recipients():
    """Kimga yuboriladi: sozlamada chat berilgan bo'lsa o'sha, aks holda Telegram ulagan super adminlar."""
    from apps.accounts.models import User
    from common import access

    if settings.BACKUP_TELEGRAM_CHAT_ID:
        return [settings.BACKUP_TELEGRAM_CHAT_ID]
    return [str(chat) for chat in User.objects.filter(role=access.SUPER_ADMIN, is_active=True,
                                                       telegram_chat_id__isnull=False)
            .values_list("telegram_chat_id", flat=True)]


def summary():
    from apps.clients.models import Client
    from apps.finance.models import Expense, Payment

    return (f"mijozlar {Client.objects.count()}, to‘lovlar {Payment.objects.count()}, "
            f"xarajatlar {Expense.objects.count()}")


def run(now=None):
    """Nusxa olish, Telegram'ga yuborish, eskilarini tozalash. Natija matnini qaytaradi."""
    now = timezone.localtime(now or timezone.now())
    folder = Path(settings.BACKUP_DIR)
    folder.mkdir(parents=True, exist_ok=True)
    folder.chmod(0o700)
    stamp = f"{now:%Y%m%d-%H%M}"
    files = [make_dump(folder, stamp)]
    media = make_media(folder, stamp)
    if media:
        files.append(media)
    for path in files:
        path.chmod(0o600)
    sent = []
    token = settings.BACKUP_TELEGRAM_TOKEN
    chats = recipients()
    if token and chats:
        for path in files:
            size = path.stat().st_size
            if size > TELEGRAM_LIMIT:
                sent.append(f"{path.name}: {size // 1024 // 1024} MB, Telegram uchun katta, serverda qoldi")
                continue
            caption = f"OBRO baza nusxasi · {now:%d.%m.%Y %H:%M} · {size / 1024:.0f} KB\n{summary()}"
            for chat_id in chats:
                send_telegram(token, chat_id, path, caption)
            sent.append(f"{path.name}: Telegram'ga yuborildi ({len(chats)} kishi)")
    removed = prune(folder, settings.BACKUP_KEEP_DAYS, now)
    return {"files": [p.name for p in files], "sent": sent, "removed": removed}
