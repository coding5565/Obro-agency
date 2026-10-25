"""Asosiy oqimlar: to'lov → maosh, kontent → mijoz tasdig'i → joylandi."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.finance.models import ExpenseCategory
from apps.payroll.models import Accrual
from apps.tasks.models import Task
from apps.worklog.models import WorkLogEntry
from tests.conftest import api_for


def issued_invoice(rahbar, project):
    from apps.finance import services

    invoice, _ = services.create_invoice_for_period(project, 0, by=rahbar)
    services.issue_invoice(invoice, by=rahbar)
    return invoice


class TestPaymentToPayroll:
    def test_payment_creates_accruals(self, rahbar, team, project, usd_rate):
        invoice = issued_invoice(rahbar, project)
        assert invoice.total == Decimal("1000.00")
        response = api_for(rahbar).post("/api/v1/finance/payments/", {
            "client": project.client_id, "amount": "1000", "currency": "USD", "paid_on": "2026-11-02",
        }, format="json")
        assert response.status_code == 201, response.data
        assert response.data["amount_uzs"] == "12650000.00"
        accruals = {a.user_id: a for a in Accrual.objects.all()}
        assert accruals[team["smm"].id].amount == Decimal("200.00")
        assert accruals[team["video"].id].amount == Decimal("125.00")
        assert accruals[team["design"].id].amount == Decimal("125.00")
        assert accruals[team["smm"].id].amount_uzs == Decimal("2530000.00")
        invoice.refresh_from_db()
        assert invoice.status_on(date(2026, 11, 3)) == "paid"

    def test_partial_payment_and_advance(self, rahbar, team, project, usd_rate):
        invoice = issued_invoice(rahbar, project)
        api = api_for(rahbar)
        api.post("/api/v1/finance/payments/", {"client": project.client_id, "amount": "400", "currency": "USD",
                                               "paid_on": "2026-11-02"}, format="json")
        assert invoice.status_on(date(2026, 11, 3)) == "partial"
        assert invoice.status_on(date(2026, 11, 7)) == "overdue"
        response = api.post("/api/v1/finance/payments/", {"client": project.client_id, "amount": "800",
                                                          "currency": "USD", "paid_on": "2026-11-03"}, format="json")
        assert response.data["unallocated_amount"] == "200.00"  # avans
        assert invoice.status_on(date(2026, 11, 7)) == "paid"
        total_smm = sum(a.amount for a in Accrual.objects.filter(user=team["smm"]))
        assert total_smm == Decimal("200.00")  # avansdan hali maosh yozilmaydi

    def test_cancel_payment_cancels_accruals(self, rahbar, team, project, usd_rate):
        issued_invoice(rahbar, project)
        api = api_for(rahbar)
        payment = api.post("/api/v1/finance/payments/", {"client": project.client_id, "amount": "1000",
                                                         "currency": "USD", "paid_on": "2026-11-02"}, format="json")
        no_reason = api.post(f"/api/v1/finance/payments/{payment.data['id']}/cancel/", {}, format="json")
        assert no_reason.status_code == 400
        api.post(f"/api/v1/finance/payments/{payment.data['id']}/cancel/", {"reason": "Xato kiritildi"},
                 format="json")
        assert not Accrual.objects.exclude(status=Accrual.CANCELLED).exists()

    def test_missing_rate_is_an_error(self, rahbar, team, project):
        issued_invoice(rahbar, project)
        response = api_for(rahbar).post("/api/v1/finance/payments/", {
            "client": project.client_id, "amount": "1000", "currency": "USD", "paid_on": "2026-11-02",
        }, format="json")
        assert response.status_code == 400
        assert "rate_to_uzs" in response.data

    def test_month_summary_and_sheet(self, rahbar, team, project, usd_rate):
        issued_invoice(rahbar, project)
        api = api_for(rahbar)
        api.post("/api/v1/finance/payments/", {"client": project.client_id, "amount": "1000", "currency": "USD",
                                               "paid_on": "2026-11-02"}, format="json")
        category = ExpenseCategory.objects.get(name="Ijara")
        expense = api.post("/api/v1/finance/expenses/", {
            "category": category.id, "amount": "5000000", "currency": "UZS", "spent_on": "2026-11-05",
            "description": "Ijara",
        }, format="json")
        assert expense.status_code == 201, expense.data
        summary = api.get("/api/v1/finance/summary/?month=2026-11").data
        assert summary["income_uzs"] == "12650000.00"
        assert summary["team_share_uzs"] == "5692500.00"  # 45%
        assert summary["profit_uzs"] == "1957500.00"
        sheet = api.get("/api/v1/payroll/sheet/?month=2026-11").data
        assert len(sheet["rows"]) == 3
        approved = api.post("/api/v1/payroll/sheet/", {"month": "2026-11", "action": "approve"}, format="json")
        assert approved.data["status"] == "approved"
        my = api_for(team["smm"]).get("/api/v1/payroll/me/?month=2026-11").data
        assert my["total_uzs"] == "2530000.00"
        assert len(my["accruals"]) == 1

    def test_project_rule_override(self, rahbar, team, project, usd_rate):
        from apps.accounts.models import Position

        api = api_for(rahbar)
        position = Position.objects.get(code=Position.SMM_TARGET)
        response = api.post("/api/v1/payroll/rules/", {"position": position.id, "percent": "25",
                                                       "valid_from": "2026-11-01", "project": project.id},
                            format="json")
        assert response.status_code == 201, response.data
        issued_invoice(rahbar, project)
        api.post("/api/v1/finance/payments/", {"client": project.client_id, "amount": "1000", "currency": "USD",
                                               "paid_on": "2026-11-02"}, format="json")
        assert Accrual.objects.get(user=team["smm"]).amount == Decimal("250.00")


class TestContentFlow:
    @pytest.fixture
    def item(self, team, project):
        response = api_for(team["smm"]).post("/api/v1/content/items/", {
            "project": project.id, "kind": "reels", "title": "Shifokor maslahati", "planned_date": "2026-11-10",
        }, format="json")
        assert response.status_code == 201, response.data
        return response.data

    def test_default_tasks_assigned(self, team, item):
        tasks = Task.objects.filter(content_item_id=item["id"])
        assert {t.assignee_id for t in tasks} == {team["smm"].id, team["video"].id, team["design"].id}

    def test_full_cycle(self, team, project, client_user, item):
        design = api_for(team["design"])
        upload = SimpleUploadedFile("reels.mp4", b"fake-video", content_type="video/mp4")
        version = design.post(f"/api/v1/content/items/{item['id']}/versions/", {"file": upload}, format="multipart")
        assert version.status_code == 201, version.data

        portal = api_for(client_user)
        assert portal.get("/api/v1/portal/approvals/").data == []  # SMM hali yubormagan

        smm = api_for(team["smm"])
        assert smm.post(f"/api/v1/content/items/{item['id']}/send-to-client/").status_code == 200
        approvals = portal.get("/api/v1/portal/approvals/").data
        assert len(approvals) == 1
        file_url = approvals[0]["version"]["file_url"]
        assert "/api/v1/files/v/" in file_url

        changes = portal.post(f"/api/v1/portal/approvals/{item['id']}/", {"decision": "changes",
                                                                           "comment": "0:12 yozuvni o‘zgartiring"},
                              format="json")
        assert changes.status_code == 200
        assert changes.data["revisions_left"] == 1

        design.post(f"/api/v1/content/items/{item['id']}/versions/", {"link": "https://drive.example/v2"},
                    format="multipart")
        smm.post(f"/api/v1/content/items/{item['id']}/send-to-client/")
        portal.post(f"/api/v1/portal/approvals/{item['id']}/", {"decision": "approve"}, format="json")
        published = smm.post(f"/api/v1/content/items/{item['id']}/publish/",
                             {"url": "https://instagram.com/p/abc"}, format="json")
        assert published.data["status"] == "published"
        assert WorkLogEntry.objects.filter(content_item_id=item["id"], kind="publishing").exists()

    def test_cannot_publish_without_client_approval(self, team, item):
        response = api_for(team["smm"]).post(f"/api/v1/content/items/{item['id']}/publish/", {}, format="json")
        assert response.status_code == 400

    def test_client_cannot_download_unsent_version(self, team, client_user, item):
        from django.test import Client as DjangoClient

        upload = SimpleUploadedFile("draft.mp4", b"secret", content_type="video/mp4")
        api_for(team["design"]).post(f"/api/v1/content/items/{item['id']}/versions/", {"file": upload},
                                     format="multipart")
        from apps.content.models import ContentVersion
        from common.files import signed_version_url

        version = ContentVersion.objects.get(item_id=item["id"])

        class FakeRequest:
            user = client_user

            def build_absolute_uri(self, path):
                return path

        url = signed_version_url(FakeRequest(), version)
        assert DjangoClient().get(url).status_code == 404  # mijozga yuborilmagan
        staff_url = signed_version_url(type("R", (FakeRequest,), {"user": team["smm"]})(), version)
        assert DjangoClient().get(staff_url).status_code == 200


class TestWorklog:
    def test_creator_entry_hidden_until_approved(self, team, project, client_user):
        entry = api_for(team["video"]).post("/api/v1/worklog/", {
            "project": project.id, "date": "2026-11-05", "kind": "other", "title": "Raqobatchilar tahlili",
        }, format="json")
        assert entry.status_code == 201
        assert entry.data["status"] == "submitted"
        portal = api_for(client_user)
        assert portal.get("/api/v1/portal/worklog/?days=60").data == []
        api_for(team["smm"]).post(f"/api/v1/worklog/{entry.data['id']}/approve/")
        # Sana 2026-11-05 — testlar boshqa kunda ishlasa ham ko'rinishi uchun katta oraliq
        assert len(portal.get("/api/v1/portal/worklog/?days=3650").data) == 1

    def test_creator_cannot_approve(self, team, project):
        entry = api_for(team["video"]).post("/api/v1/worklog/", {
            "project": project.id, "date": "2026-11-05", "kind": "other", "title": "X",
        }, format="json")
        assert api_for(team["design"]).post(f"/api/v1/worklog/{entry.data['id']}/approve/").status_code == 403
