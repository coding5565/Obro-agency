"""Telegram bot API va Markaziy bank kursi."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.content import models as cm
from apps.content import services as content_services
from apps.finance import rates
from apps.finance.models import ExchangeRate
from apps.notifications.models import Notification
from apps.notifications.services import notify
from apps.worklog.models import WorkLogEntry
from common import access
from tests.conftest import api_for, make_project, make_user

SECRET = "test-bot-secret-0123456789"


def bot():
    client = APIClient()
    client.credentials(HTTP_X_BOT_SECRET=SECRET)
    return client


def link(user, chat_id):
    url = api_for(user).post("/api/v1/telegram/link/").data["url"]
    token = url.split("start=")[1]
    response = bot().post("/api/v1/bot/link/", {"token": token, "chat_id": chat_id, "username": "test"}, format="json")
    assert response.status_code == 200, response.data
    user.refresh_from_db()
    return token


class TestLinking:
    def test_link_flow(self, team):
        token = link(team["smm"], 1001)
        assert team["smm"].telegram_chat_id == 1001
        assert api_for(team["smm"]).get("/api/v1/auth/me/").data["telegram_linked"] is True
        again = bot().post("/api/v1/bot/link/", {"token": token, "chat_id": 1002}, format="json")
        assert again.status_code == 400  # bir martalik

    def test_wrong_secret_rejected(self, team):
        client = APIClient()
        client.credentials(HTTP_X_BOT_SECRET="xato")
        assert client.get("/api/v1/bot/outbox/").status_code == 403
        assert APIClient().get("/api/v1/bot/outbox/").status_code == 403

    def test_same_chat_moves_to_new_user(self, team):
        link(team["smm"], 2002)
        link(team["video"], 2002)
        team["smm"].refresh_from_db()
        assert team["smm"].telegram_chat_id is None
        assert team["video"].telegram_chat_id == 2002

    def test_unknown_chat(self, team):
        assert bot().get("/api/v1/bot/me/?chat_id=999").status_code == 404

    def test_unlink_from_panel(self, team):
        link(team["smm"], 3003)
        api_for(team["smm"]).delete("/api/v1/telegram/link/")
        team["smm"].refresh_from_db()
        assert team["smm"].telegram_chat_id is None


class TestOutbox:
    def test_only_new_notifications_for_linked_users(self, team):
        old = notify([team["smm"]], "test", "Eski xabar")[0]
        Notification.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(hours=1))
        link(team["smm"], 4004)
        notify([team["smm"], team["video"]], "test", "Yangi <xabar>")
        rows = bot().get("/api/v1/bot/outbox/").data
        assert [r["chat_id"] for r in rows] == [4004]
        assert "Yangi &lt;xabar&gt;" in rows[0]["text"]
        bot().post("/api/v1/bot/outbox/ack/", {"ids": [rows[0]["id"]]}, format="json")
        assert bot().get("/api/v1/bot/outbox/").data == []

    def test_review_notification_has_buttons(self, team, project, client_user):
        link(client_user, 5005)
        item = content_services.create_item(project=project, by=team["smm"], kind="reels", title="Klip")
        content_services.add_version(item, by=team["design"], link="https://drive.example/v1")
        content_services.send_to_client(item, by=team["smm"])
        rows = [r for r in bot().get("/api/v1/bot/outbox/").data if r["chat_id"] == 5005]
        assert rows[0]["buttons"][0][0]["callback"] == f"ap:{item.id}"


class TestBotActions:
    def test_client_approves_from_telegram(self, team, project, client_user, other_project):
        link(client_user, 6006)
        item = content_services.create_item(project=project, by=team["smm"], kind="reels", title="Klip")
        content_services.add_version(item, by=team["design"], link="https://drive.example/v1")
        content_services.send_to_client(item, by=team["smm"])
        response = bot().post(f"/api/v1/bot/approvals/{item.id}/", {"chat_id": 6006, "decision": "approve"},
                              format="json")
        assert response.status_code == 200, response.data
        item.refresh_from_db()
        assert item.status == cm.APPROVED
        foreign = content_services.create_item(project=other_project, by=team["smm"], kind="post", title="Begona")
        assert bot().get(f"/api/v1/bot/approvals/{foreign.id}/?chat_id=6006").status_code == 404

    def test_changes_need_comment(self, team, project, client_user):
        link(client_user, 6007)
        item = content_services.create_item(project=project, by=team["smm"], kind="reels", title="Klip")
        content_services.add_version(item, by=team["design"], link="https://drive.example/v1")
        content_services.send_to_client(item, by=team["smm"])
        empty = bot().post(f"/api/v1/bot/approvals/{item.id}/", {"chat_id": 6007, "decision": "changes"},
                           format="json")
        assert empty.status_code == 400

    def test_staff_tasks_and_done(self, team, project):
        link(team["video"], 7007)
        item = content_services.create_item(project=project, by=team["smm"], kind="reels", title="Klip",
                                            planned_date=timezone.localdate())
        tasks = bot().get("/api/v1/bot/tasks/?chat_id=7007").data
        assert len(tasks) == 1 and tasks[0]["client"] == "Klinika A"
        done = bot().post(f"/api/v1/bot/tasks/{tasks[0]['id']}/done/", {"chat_id": 7007}, format="json")
        assert done.status_code == 200
        assert WorkLogEntry.objects.filter(content_item=item, user=team["video"]).exists()

    def test_cannot_finish_someone_elses_task(self, team, project):
        link(team["design"], 7008)
        content_services.create_item(project=project, by=team["smm"], kind="reels", title="Klip")
        video_task = team["video"].tasks.first()
        response = bot().post(f"/api/v1/bot/tasks/{video_task.id}/done/", {"chat_id": 7008}, format="json")
        assert response.status_code == 404

    def test_worklog_from_bot(self, team, project, client_user):
        link(team["video"], 8008)
        response = bot().post("/api/v1/bot/worklog/", {"chat_id": 8008, "project": project.id, "kind": "shooting",
                                                       "title": "Interyer kadrlari"}, format="json")
        assert response.status_code == 201
        entry = WorkLogEntry.objects.get(title="Interyer kadrlari")
        assert entry.source == "bot" and entry.status == "submitted"
        link(client_user, 8009)
        assert bot().post("/api/v1/bot/worklog/", {"chat_id": 8009, "project": project.id, "title": "x"},
                          format="json").status_code == 403


class TestScheduledJobs:
    def test_evening_reminder_only_for_empty_journal(self, team, project):
        link(team["video"], 9001)
        link(team["design"], 9002)
        WorkLogEntry.objects.create(user=team["design"], project=project, date=timezone.localdate(), title="Dizayn")
        response = bot().post("/api/v1/bot/jobs/evening/", {}, format="json")
        # Telegram ulanmagan SMM ham eslatma oladi: u panelda ko'rinadi. Jurnali to'lgan dizaynerga bormaydi.
        assert response.data["reminders"] == 2
        assert not Notification.objects.filter(user=team["design"], kind="worklog.reminder").exists()
        assert Notification.objects.filter(user=team["video"], kind="worklog.reminder").exists()

    def test_morning_digest_for_managers(self, rahbar, monkeypatch):
        link(rahbar, 9003)
        monkeypatch.setattr(rates, "fetch_cbu_rate", lambda currency, day, timeout=None: Decimal("11838.92"))
        response = bot().post("/api/v1/bot/jobs/daily/", {}, format="json")
        assert response.data["digest"] == 1 and Decimal(response.data["rate"]) == Decimal("11838.92")
        assert Notification.objects.filter(user=rahbar, kind="digest.morning").exists()


class TestRates:
    def test_parse_cbu(self):
        payload = [{"Ccy": "USD", "Nominal": "1", "Rate": "11838.92", "Date": "24.10.2026"}]
        assert rates.parse_cbu(payload, "USD") == Decimal("11838.9200")
        with pytest.raises(rates.RateFetchError):
            rates.parse_cbu([], "USD")

    def test_payment_uses_cbu_rate_when_missing(self, rahbar, team, project, monkeypatch, settings):
        from apps.finance import services

        settings.CBU_AUTO_FETCH = True
        calls = []

        def fake(currency, day, timeout=None):
            calls.append(day)
            return Decimal("11838.92")

        monkeypatch.setattr(rates, "fetch_cbu_rate", fake)
        invoice, _ = services.create_invoice_for_period(project, 0, by=rahbar)
        services.issue_invoice(invoice, by=rahbar)
        payment = services.record_payment(client=project.client, amount="1000", currency="USD",
                                          paid_on=date(2026, 11, 2), by=rahbar)
        assert payment.rate_to_uzs == Decimal("11838.92")
        assert calls == [date(2026, 11, 2)]
        assert ExchangeRate.objects.filter(date=date(2026, 11, 2), source="cbu").exists()

    def test_offline_falls_back_to_last_known(self, monkeypatch, settings, usd_rate):
        settings.CBU_AUTO_FETCH = True

        def offline(*args, **kwargs):
            raise rates.RateFetchError("internet yo‘q")

        monkeypatch.setattr(rates, "fetch_cbu_rate", offline)
        assert rates.rate_for_day("USD", date(2026, 11, 2)) == usd_rate.rate_to_uzs


def test_bot_cannot_be_used_without_secret_configured(settings, team):
    settings.TELEGRAM_BOT_API_SECRET = ""
    client = APIClient()
    client.credentials(HTTP_X_BOT_SECRET="")
    assert client.get("/api/v1/bot/outbox/").status_code == 403


@pytest.fixture
def other_client_user(other_project):
    from apps.clients.models import ClientMembership

    user = make_user("+998901110077", access.CLIENT_OWNER)
    ClientMembership.objects.create(user=user, client=other_project.client)
    return user


def test_make_project_helper_still_works(team):
    assert make_project("Test", "basic", team).client.name == "Test"
