"""Lidlar, TZ, syomka va ogohlantirishlar."""
from datetime import datetime, time, timedelta

import pytest
from django.utils import timezone

from apps.content.models import Brief, ContentItem, ShootDay
from apps.content.shoots import conflicts
from apps.leads import models as lm
from apps.leads.views import csv_safe
from apps.notifications.models import Notification
from apps.notifications.reminders import run_due
from apps.notifications.services import notify
from apps.tasks import models as tm
from common.calc.leads import is_ping, parse_lead
from tests.conftest import api_for, make_project, make_user


@pytest.fixture
def source(project):
    return lm.LeadSource.objects.create(project=project, name="Yuboraman: aksiya", kind="yuboraman")


def hook(token, data, **kwargs):
    from rest_framework.test import APIClient

    return APIClient().post(f"/api/v1/leads/hook/{token}/", data, format=kwargs.pop("format", "json"), **kwargs)


def at(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class TestParser:
    def test_meta_field_data(self):
        lead = parse_lead({"leadgen_id": "L1", "form": {"id": 7, "name": "Aksiya"}, "field_data": [
            {"name": "full_name", "values": ["Ali Valiyev"]}, {"name": "phone_number", "values": ["+998 90 123-45-67"]},
        ]})
        assert lead["full_name"] == "Ali Valiyev"
        assert lead["phone"] == "+998901234567"
        assert lead["form_name"] == "Aksiya"
        assert lead["external_id"] == "L1"

    def test_uzbek_and_russian_keys(self):
        assert parse_lead({"Ismingiz": "x", "ism": "Vali", "telefon": "901234567"})["phone"] == "+998901234567"
        lead = parse_lead({"Имя": "Иван", "Телефон": "+998 91 000 00 00"})
        assert lead["full_name"] == "Иван" and lead["phone"] == "+998910000000"

    def test_unknown_phone_key_is_still_found(self):
        assert parse_lead({"a1": "+998901112233"})["phone"] == "+998901112233"

    def test_ping(self):
        assert is_ping({"test": "test"}) and is_ping({})
        assert not is_ping({"phone": "1"})


class TestWebhook:
    def test_creates_lead_and_notifies(self, source, team, client_user):
        response = hook(source.token, {"id": "A1", "name": "Ali", "phone": "901234567", "form_name": "Aksiya"})
        assert response.status_code == 200 and response.data["duplicate"] is False
        lead = lm.Lead.objects.get(pk=response.data["lead_id"])
        assert lead.phone == "+998901234567" and lead.assigned_to == team["smm"]
        assert Notification.objects.filter(user=team["smm"], kind="lead.new").exists()
        assert Notification.objects.filter(user=client_user, kind="lead.new").exists()
        source.refresh_from_db()
        assert source.received_count == 1

    def test_retry_does_not_duplicate(self, source):
        hook(source.token, {"id": "A1", "phone": "901234567"})
        response = hook(source.token, {"id": "A1", "phone": "901234567"})
        assert response.data["duplicate"] is True
        assert lm.Lead.objects.count() == 1

    def test_same_phone_is_marked_duplicate(self, source):
        first = hook(source.token, {"id": "A1", "phone": "901234567"}).data["lead_id"]
        second = hook(source.token, {"id": "A2", "phone": "+998 90 123 45 67"}).data["lead_id"]
        assert lm.Lead.objects.get(pk=second).duplicate_of_id == first

    def test_bad_token_and_paused_source(self, source):
        assert hook("yoq", {"phone": "1"}).status_code == 404
        source.is_active = False
        source.save()
        assert hook(source.token, {"phone": "901234567"}).status_code == 410
        assert lm.Lead.objects.count() == 0

    def test_form_encoded_and_ping(self, source):
        assert hook(source.token, {"test": "test"}).data["ignored"] is True
        response = hook(source.token, {"name": "Tilda", "phone": "901234567"}, format="multipart")
        assert lm.Lead.objects.get(pk=response.data["lead_id"]).full_name == "Tilda"

    def test_broken_body_is_kept_not_lost(self, source):
        from rest_framework.test import APIClient

        response = APIClient().post(f"/api/v1/leads/hook/{source.token}/", "bu json emas",
                                    content_type="application/json")
        assert response.status_code == 200
        assert lm.Lead.objects.get().raw["_raw"] == "bu json emas"

    def test_group_message_goes_to_outbox(self, source):
        from apps.telegram.services import outbox

        source.telegram_chat_id = -100123
        source.save()
        hook(source.token, {"id": "G1", "name": "Ali", "phone": "901234567"})
        assert -100123 in [row["chat_id"] for row in outbox()]


class TestAccess:
    def test_creator_cannot_see_leads(self, source, team):
        hook(source.token, {"phone": "901234567"})
        assert api_for(team["video"]).get("/api/v1/leads/items/").status_code == 403
        assert api_for(team["video"]).get("/api/v1/leads/sources/").status_code == 403

    def test_smm_sees_only_own_projects(self, source, other_project, team):
        foreign = lm.LeadSource.objects.create(project=other_project, name="B")
        hook(source.token, {"id": "1", "phone": "901234567"})
        other = hook(foreign.token, {"id": "2", "phone": "907654321"}).data["lead_id"]
        api = api_for(team["smm"])
        assert api.get("/api/v1/leads/items/").data["count"] == 1
        assert api.get(f"/api/v1/leads/items/{other}/").status_code == 404
        assert api.get(f"/api/v1/leads/sources/{foreign.pk}/").status_code == 404

    def test_client_sees_own_without_raw(self, source, client_user, other_project):
        foreign = lm.LeadSource.objects.create(project=other_project, name="B")
        hook(source.token, {"id": "1", "phone": "901234567", "maxfiy": "x"})
        other = hook(foreign.token, {"id": "2", "phone": "907654321"}).data["lead_id"]
        api = api_for(client_user)
        data = api.get("/api/v1/portal/leads/").data
        assert len(data["results"]) == 1
        assert "raw" not in data["results"][0] and "assigned_to" not in data["results"][0]
        assert api.patch(f"/api/v1/portal/leads/{other}/", {"status": "won"}, format="json").status_code == 404

    def test_basic_tariff_client_has_no_leads(self, team):
        project = make_project("Kichik", "basic", team)
        user = make_user("+998901119999", "client_owner")
        project.client.memberships.create(user=user)
        assert api_for(user).get("/api/v1/portal/leads/").status_code == 403
        # Syomka har qanday tarifda ko'rinadi.
        assert api_for(user).get("/api/v1/portal/shoots/").status_code == 200


class TestLeadFlow:
    def test_status_flow_and_stats(self, source, team):
        lead_id = hook(source.token, {"id": "1", "phone": "901234567"}).data["lead_id"]
        api = api_for(team["smm"])
        url = f"/api/v1/leads/items/{lead_id}/"
        assert api.post(url + "set-status/", {"status": "lost"}, format="json").status_code == 400
        response = api.post(url + "set-status/", {"status": "won", "sale_amount": "500000"}, format="json")
        assert response.status_code == 200 and response.data["first_response_at"]
        stats = api.get("/api/v1/leads/items/stats/").data
        assert stats["total"] == 1 and stats["won"] == 1 and stats["conversion_percent"] == 100
        assert stats["sales"]["UZS"].startswith("500000")

    def test_spam_and_duplicates_do_not_count(self, source, team):
        spam = hook(source.token, {"id": "1", "phone": "901234567"}).data["lead_id"]
        hook(source.token, {"id": "2", "phone": "901234567"})
        api = api_for(team["smm"])
        api.post(f"/api/v1/leads/items/{spam}/set-status/", {"status": "spam"}, format="json")
        assert api.get("/api/v1/leads/items/stats/").data["total"] == 0

    def test_source_test_button(self, source, team):
        response = api_for(team["smm"]).post(f"/api/v1/leads/sources/{source.pk}/test/")
        assert response.status_code == 201 and response.data["status"] == "spam"
        assert api_for(team["smm"]).get("/api/v1/leads/items/stats/").data["total"] == 0

    def test_manual_create_and_export_blocks_formulas(self, project, team):
        api = api_for(team["smm"])
        response = api.post("/api/v1/leads/items/", {"project": project.pk, "full_name": "=HYPERLINK(1)",
                                                     "phone": "901234567"}, format="json")
        assert response.status_code == 201
        body = api.get("/api/v1/leads/items/export/").content.decode("utf-8")
        assert "'=HYPERLINK(1)" in body and "+998901234567" in body
        assert csv_safe("+1") == "'+1" and csv_safe("Ali") == "Ali"


class TestBriefs:
    def _brief(self, project, team, **kwargs):
        api = api_for(team["smm"])
        response = api.post("/api/v1/content/briefs/", {
            "project": project.pk, "title": "Reels 1", "assignee": team["video"].pk,
            "shot_list": [{"text": "Kirish"}, {"text": " "}, {"text": "Yakun"}], **kwargs,
        }, format="json")
        assert response.status_code == 201, response.data
        return response.data["id"]

    def test_full_flow(self, project, team):
        item = ContentItem.objects.create(project=project, title="Reels", kind="reels")
        task = tm.Task.objects.create(project=project, title="Syomka", assignee=team["video"], content_item=item)
        pk = self._brief(project, team, content_item=item.pk)
        smm, video = api_for(team["smm"]), api_for(team["video"])
        url = f"/api/v1/content/briefs/{pk}/"
        assert len(smm.get(url).data["shot_list"]) == 2
        # Qoralama ijodkorga ko'rinmaydi.
        assert video.get(url).status_code == 404
        assert smm.post(url + "send/").status_code == 200
        assert Notification.objects.filter(user=team["video"], kind="brief.sent").exists()
        assert video.get(url).data["seen_at"]
        assert video.post(url + "send/").status_code == 403
        assert video.post(url + "accept/").data["status"] == "in_progress"
        assert video.post(url + "shot/", {"index": 0, "done": True}, format="json").data["shot_list"][0]["done"]
        assert video.post(url + "submit/").data["status"] == "review"
        assert video.post(url + "approve/").status_code == 403
        assert smm.post(url + "return/", {"comment": ""}, format="json").status_code == 400
        assert smm.post(url + "return/", {"comment": "Ovoz past"}, format="json").data["status"] == "changes"
        assert video.post(url + "submit/").data["status"] == "review"
        assert smm.post(url + "approve/").data["status"] == "done"
        task.refresh_from_db()
        assert task.status == tm.DONE

    def test_other_creator_and_client_cannot_see(self, project, team, client_user):
        pk = self._brief(project, team)
        api_for(team["smm"]).post(f"/api/v1/content/briefs/{pk}/send/")
        assert api_for(team["design"]).get(f"/api/v1/content/briefs/{pk}/").status_code == 404
        assert api_for(client_user).get(f"/api/v1/content/briefs/{pk}/").status_code == 403

    def test_assignee_must_be_on_project(self, other_project, project, team):
        response = api_for(team["smm"]).post("/api/v1/content/briefs/", {
            "project": project.pk, "title": "x", "assignee": make_user("+998901118888", "creator").pk,
        }, format="json")
        assert response.status_code == 400


class TestShoots:
    def _shoot(self, project, team, day, start="10:00", end="12:00", **extra):
        response = api_for(team["smm"]).post("/api/v1/content/shoot-days/", {
            "project": project.pk, "date": str(day), "start_time": start, "end_time": end,
            "participants": [team["video"].pk], "location": "Klinika", **extra,
        }, format="json")
        assert response.status_code == 201, response.data
        return response.data

    def test_notifies_team_and_client(self, project, team, client_user):
        self._shoot(project, team, timezone.localdate() + timedelta(days=5), client_prep="Xonani tayyorlang")
        assert Notification.objects.filter(user=team["video"], kind="shoot.new").exists()
        row = Notification.objects.get(user=client_user, kind="shoot.confirm")
        assert "Xonani tayyorlang" in row.body

    def test_conflict_warning(self, project, other_project, team):
        day = timezone.localdate() + timedelta(days=5)
        other = ShootDay.objects.create(project=other_project, date=day, start_time=time(11), end_time=time(13))
        other.participants.add(team["video"])
        data = self._shoot(project, team, day)
        assert data["conflicts"][0]["client"] == other_project.client.name
        later = self._shoot(project, team, day + timedelta(days=1))
        assert later["conflicts"] == []
        assert conflicts(ShootDay.objects.get(pk=later["id"])) == []

    def test_end_before_start_is_rejected(self, project, team):
        response = api_for(team["smm"]).post("/api/v1/content/shoot-days/", {
            "project": project.pk, "date": "2026-12-01", "start_time": "12:00", "end_time": "10:00",
        }, format="json")
        assert response.status_code == 400

    def test_client_confirm_and_move_resets_it(self, project, team, client_user):
        data = self._shoot(project, team, timezone.localdate() + timedelta(days=5))
        client = api_for(client_user)
        confirm = client.post(f"/api/v1/portal/shoots/{data['id']}/confirm/")
        assert confirm.data["client_confirmed_at"]
        assert "participants" not in confirm.data and "notes" not in confirm.data
        api_for(team["smm"]).patch(f"/api/v1/content/shoot-days/{data['id']}/",
                                   {"start_time": "15:00", "end_time": "17:00"}, format="json")
        assert ShootDay.objects.get(pk=data["id"]).client_confirmed_at is None

    def test_cancel(self, project, team, client_user):
        data = self._shoot(project, team, timezone.localdate() + timedelta(days=5))
        response = api_for(team["smm"]).post(f"/api/v1/content/shoot-days/{data['id']}/cancel/", {"reason": "Mijoz"},
                                             format="json")
        assert response.data["status"] == "cancelled"
        assert Notification.objects.filter(user=client_user, kind="shoot.cancelled").exists()


class TestReminders:
    def test_shoot_reminders_once_and_after_move(self, project, team, client_user):
        now = at(timezone.localdate(), 12)
        shoot = ShootDay.objects.create(project=project, date=now.date() + timedelta(days=1), start_time=time(9))
        shoot.participants.add(team["video"])
        run_due(now)
        run_due(now)
        assert Notification.objects.filter(user=team["video"], kind="shoot.tomorrow").count() == 1
        assert Notification.objects.filter(user=team["smm"], kind="shoot.unconfirmed").count() == 1
        assert Notification.objects.filter(user=client_user, kind="shoot.confirm").count() == 1
        shoot.start_time = time(10)
        shoot.save()
        run_due(now)
        assert Notification.objects.filter(user=team["video"], kind="shoot.tomorrow").count() == 2

    def test_two_hour_reminder(self, project, team):
        now = at(timezone.localdate(), 12)
        shoot = ShootDay.objects.create(project=project, date=now.date(), start_time=time(13))
        shoot.participants.add(team["video"])
        run_due(now)
        assert Notification.objects.filter(user=team["video"], kind="shoot.soon").count() == 1

    def test_brief_deadline_overdue_daily(self, project, team):
        now = at(timezone.localdate(), 12)
        Brief.objects.create(project=project, title="TZ", assignee=team["video"], status=Brief.IN_PROGRESS,
                             deadline=now - timedelta(hours=1))
        run_due(now)
        run_due(now + timedelta(minutes=5))
        assert Notification.objects.filter(user=team["video"], kind="brief.overdue").count() == 1
        run_due(now + timedelta(days=1))
        assert Notification.objects.filter(user=team["video"], kind="brief.overdue").count() == 2

    def _aged_lead(self, source, created_at):
        lead = lm.Lead.objects.create(project=source.project, source=source, phone="+998901234567",
                                      assigned_to=source.project.assignments.first().user)
        lm.Lead.objects.filter(pk=lead.pk).update(created_at=created_at)
        return lead

    def test_lead_sla_and_escalation(self, source, team, rahbar):
        now = at(timezone.localdate(), 12)
        self._aged_lead(source, now - timedelta(minutes=20))
        run_due(now)
        assert Notification.objects.filter(user=team["smm"], kind="lead.sla").count() == 1
        assert not Notification.objects.filter(user=rahbar, kind="lead.sla").exists()
        run_due(now + timedelta(minutes=45))
        assert Notification.objects.filter(user=rahbar, kind="lead.sla").count() == 1

    def test_answered_or_night_lead_is_silent(self, source, team):
        now = at(timezone.localdate(), 12)
        lead = self._aged_lead(source, now - timedelta(minutes=20))
        run_due(at(now.date(), 23))
        assert not Notification.objects.filter(kind="lead.sla").exists()
        lead.status = lm.CONTACTED
        lead.save()
        run_due(now)
        assert not Notification.objects.filter(kind="lead.sla").exists()

    def test_next_contact_reminder(self, source, team):
        now = at(timezone.localdate(), 12)
        lm.Lead.objects.create(project=source.project, assigned_to=team["smm"], status=lm.CONTACTED,
                               next_contact_at=now - timedelta(minutes=1))
        run_due(now)
        run_due(now)
        assert Notification.objects.filter(user=team["smm"], kind="lead.followup").count() == 1

    def test_digest_and_rate_alert_once_a_day(self, rahbar, source):
        now = at(timezone.localdate(), 11)
        run_due(now)
        run_due(now + timedelta(minutes=5))
        assert Notification.objects.filter(user=rahbar, kind="digest.morning").count() == 1
        assert Notification.objects.filter(user=rahbar, kind="rate.missing").count() == 1

    def test_dedupe_key(self, team):
        for _ in range(2):
            notify([team["smm"]], "x", "t", dedupe_key="k1")
        assert Notification.objects.filter(user=team["smm"], kind="x").count() == 1


class TestDashboardAlerts:
    def test_alerts(self, source, project, team):
        ShootDay.objects.create(project=project, date=timezone.localdate(), start_time=time(23, 30))
        Brief.objects.create(project=project, title="TZ", assignee=team["smm"], status=Brief.SENT,
                             deadline=timezone.now() - timedelta(hours=1))
        hook(source.token, {"id": "1", "phone": "901234567"})
        titles = " ".join(a["title"] for a in api_for(team["smm"]).get("/api/v1/dashboard/").data["alerts"])
        assert "Bugun syomka" in titles and "Muddati o‘tgan TZ" in titles and "Javob kutayotgan" in titles

    def test_creator_has_no_lead_alert(self, source, team):
        hook(source.token, {"id": "1", "phone": "901234567"})
        alerts = api_for(team["video"]).get("/api/v1/dashboard/").data["alerts"]
        assert not any("lid" in a["title"] for a in alerts)
