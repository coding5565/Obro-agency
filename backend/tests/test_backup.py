"""Zaxira nusxa: eskilarini tozalash, Telegram chegarasi va xato bo'lsa ogohlantirish."""
import os
import time
from pathlib import Path

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.core import backup
from apps.notifications.models import Notification
from common import access
from tests.conftest import make_user


def touch(folder: Path, name: str, days_old: float):
    path = folder / name
    path.write_bytes(b"x")
    old = time.time() - days_old * 86400
    os.utime(path, (old, old))
    return path


def test_prune_keeps_recent_and_latest(tmp_path):
    touch(tmp_path, "obro-baza-1.dump", 30)
    touch(tmp_path, "obro-baza-2.dump", 20)
    touch(tmp_path, "obro-baza-3.dump", 2)
    touch(tmp_path, "boshqa.txt", 40)
    removed = backup.prune(tmp_path, keep_days=14)
    assert removed == ["obro-baza-1.dump", "obro-baza-2.dump"]
    assert (tmp_path / "obro-baza-3.dump").exists() and (tmp_path / "boshqa.txt").exists()


def test_prune_never_deletes_last_copies(tmp_path):
    touch(tmp_path, "obro-baza-1.dump", 60)
    touch(tmp_path, "obro-fayllar-1.tar.gz", 60)
    assert backup.prune(tmp_path, keep_days=14) == []


def test_run_sends_small_files_and_keeps_big_ones(tmp_path, settings, monkeypatch):
    settings.BACKUP_DIR = str(tmp_path)
    settings.BACKUP_TELEGRAM_TOKEN = "t"
    settings.BACKUP_TELEGRAM_CHAT_ID = "1"
    settings.MEDIA_ROOT = str(tmp_path / "media")
    (tmp_path / "media").mkdir()
    (tmp_path / "media" / "a.jpg").write_bytes(b"rasm")

    def fake_dump(folder, stamp):
        path = folder / f"obro-baza-{stamp}.dump"
        path.write_bytes(b"d" * 10)
        return path

    sent = []
    monkeypatch.setattr(backup, "make_dump", fake_dump)
    monkeypatch.setattr(backup, "send_telegram", lambda token, chat, path, caption: sent.append(path.name))
    monkeypatch.setattr(backup, "TELEGRAM_LIMIT", 100_000)
    result = backup.run()
    assert len(result["files"]) == 2
    assert sent == result["files"]
    monkeypatch.setattr(backup, "TELEGRAM_LIMIT", 5)
    sent.clear()
    result = backup.run()
    assert sent == [] and all("katta" in line for line in result["sent"])


def test_failure_notifies_super_admins(db, monkeypatch):
    admin = make_user("+998901110055", access.SUPER_ADMIN)

    def broken(folder, stamp):
        raise backup.BackupError("pg_dump xatosi: ulanmadi")

    monkeypatch.setattr(backup, "make_dump", broken)
    with pytest.raises(CommandError):
        call_command("backup_db")
    assert Notification.objects.filter(user=admin, kind="backup.failed").exists()
