"""Hisoblar, sheriklar, hisobotlar, maosh to'lovini bekor qilish va harakatlar jurnali."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.core.models import AuditLog
from apps.finance.cash import balance, run_recurring
from apps.finance.models import CashAccount, ExpenseCategory, RecurringExpense
from apps.notifications.models import Notification
from apps.notifications.reminders import invoices, payroll_sheet
from apps.payroll.models import Adjustment
from common import access
from common.activity import describe
from common.csvutil import csv_safe
from tests.conftest import api_for, make_user
from tests.test_flows import issued_invoice

PAY = {"amount": "1000", "currency": "USD", "paid_on": "2026-11-02"}


@pytest.fixture
def uzs(db):
    return CashAccount.objects.create(name="Ofis kassasi", currency="UZS", opening_balance=Decimal("1000000"))


@pytest.fixture
def usd(db):
    return CashAccount.objects.create(name="Dollar kassa", currency="USD")


@pytest.fixture
def category(db):
    return ExpenseCategory.objects.create(name="Sinov")


def expense(api, category, amount="100000", account=None, **extra):
    body = {"category": category.pk, "amount": amount, "currency": "UZS", "spent_on": "2026-11-05",
            "description": "Ijara", **extra}
    if account:
        body["account"] = account.pk
    return api.post("/api/v1/finance/expenses/", body, format="json")


class TestAccounts:
    def test_balance_follows_every_movement(self, rahbar, project, usd_rate, uzs, usd, category):
        api = api_for(rahbar)
        issued_invoice(rahbar, project)
        pay = api.post("/api/v1/finance/payments/", {**PAY, "client": project.client_id, "account": usd.pk},
                       format="json")
        assert pay.status_code == 201
        assert balance(usd) == Decimal("1000.00")
        spent = expense(api, category, account=uzs)
        assert balance(uzs) == Decimal("900000.00")
        api.post(f"/api/v1/finance/expenses/{spent.data['id']}/cancel/", {"reason": "Xato"}, format="json")
        assert balance(uzs) == Decimal("1000000.00")
        moved = api.post("/api/v1/finance/transfers/", {"from_account": usd.pk, "to_account": uzs.pk, "amount": "100",
                                                        "to_amount": "1200000", "moved_on": "2026-11-06"}, format="json")  # noqa: E501
        assert moved.status_code == 201
        assert balance(usd) == Decimal("900.00") and balance(uzs) == Decimal("2200000.00")
        api.post(f"/api/v1/finance/transfers/{moved.data['id']}/cancel/", {"reason": "Xato"}, format="json")
        assert balance(usd) == Decimal("1000.00")

    def test_statement_shows_running_balance(self, rahbar, uzs, category):
        api = api_for(rahbar)
        expense(api, category, account=uzs)
        data = api.get(f"/api/v1/finance/accounts/{uzs.pk}/statement/", {"month": "2026-11"}).data
        assert data["opening"] == "1000000.00" and data["closing"] == "900000.00"
        assert data["items"][0]["amount"] == "-100000.00"
        assert api.get(f"/api/v1/finance/accounts/{uzs.pk}/").data["balance"] == "900000.00"

    def test_currency_mismatch_and_same_account_rejected(self, rahbar, uzs, usd, category):
        api = api_for(rahbar)
        assert expense(api, category, account=usd).status_code == 400
        same = api.post("/api/v1/finance/transfers/", {"from_account": uzs.pk, "to_account": uzs.pk, "amount": "1",
                                                       "moved_on": "2026-11-06"}, format="json")
        assert same.status_code == 400
        no_amount = api.post("/api/v1/finance/transfers/", {"from_account": usd.pk, "to_account": uzs.pk, "amount": "1",
                                                            "moved_on": "2026-11-06"}, format="json")
        assert no_amount.status_code == 400

    def test_smm_cannot_touch_accounts_or_partners(self, team, uzs):
        api = api_for(team["smm"])
        assert api.get("/api/v1/finance/accounts/").status_code == 403
        assert api.get("/api/v1/finance/partners/").status_code == 403
        assert api.get("/api/v1/finance/trend/").status_code == 403
        assert api.get("/api/v1/finance/export/payments/").status_code == 403


class TestExpenses:
    def test_cancel_removes_from_profit_and_only_once(self, rahbar, category):
        api = api_for(rahbar)
        spent = expense(api, category)
        assert api.get("/api/v1/finance/summary/", {"month": "2026-11"}).data["expenses_uzs"] == "100000.00"
        url = f"/api/v1/finance/expenses/{spent.data['id']}/cancel/"
        assert api.post(url, {}, format="json").status_code == 400
        assert api.post(url, {"reason": "Xato"}, format="json").status_code == 200
        assert api.post(url, {"reason": "Xato"}, format="json").status_code == 400
        assert api.get("/api/v1/finance/summary/", {"month": "2026-11"}).data["expenses_uzs"] == "0.00"

    def test_staff_requests_and_sees_only_own(self, rahbar, team, category):
        creator = api_for(team["video"])
        asked = expense(creator, category)
        assert asked.data["status"] == "requested"
        assert api_for(team["design"]).get("/api/v1/finance/expenses/").data["count"] == 0
        assert creator.post(f"/api/v1/finance/expenses/{asked.data['id']}/approve/").status_code == 403
        assert api_for(rahbar).post(f"/api/v1/finance/expenses/{asked.data['id']}/approve/").status_code == 200

    def test_receipt_upload_and_private_download(self, rahbar, team, category, tmp_path, settings):
        settings.MEDIA_ROOT = tmp_path
        api = api_for(rahbar)
        body = {"category": category.pk, "amount": "1000", "currency": "UZS", "spent_on": "2026-11-05",
                "description": "Chek", "receipt": SimpleUploadedFile("chek.pdf", b"%PDF-1", "application/pdf")}
        created = api.post("/api/v1/finance/expenses/", body, format="multipart")
        assert created.status_code == 201 and created.data["has_receipt"] is True
        assert "receipt" not in created.data
        url = f"/api/v1/finance/expenses/{created.data['id']}/receipt/"
        assert api.get(url).status_code == 200
        assert api_for(team["video"]).get(url).status_code == 404
        bad = dict(body, receipt=SimpleUploadedFile("virus.exe", b"x"))
        assert api.post("/api/v1/finance/expenses/", bad, format="multipart").status_code == 400

    def test_recurring_written_once_a_month(self, rahbar, category, uzs):
        RecurringExpense.objects.create(category=category, description="Ijara", amount=500000, currency="UZS",
                                        day_of_month=5, account=uzs, created_by=rahbar)
        assert run_recurring(date(2026, 11, 4)) == []
        assert len(run_recurring(date(2026, 11, 5))) == 1
        assert run_recurring(date(2026, 11, 20)) == []
        assert balance(uzs) == Decimal("500000.00")
        assert len(run_recurring(date(2026, 12, 5))) == 1

    def test_recurring_day_limit(self, rahbar, category):
        response = api_for(rahbar).post("/api/v1/finance/recurring/", {
            "category": category.pk, "description": "x", "amount": "1", "currency": "UZS", "day_of_month": 31,
        }, format="json")
        assert response.status_code == 400


class TestReports:
    def test_bonus_reduces_profit_but_advance_does_not(self, rahbar, team, project, usd_rate):
        api = api_for(rahbar)
        issued_invoice(rahbar, project)
        api.post("/api/v1/finance/payments/", {**PAY, "client": project.client_id}, format="json")
        before = Decimal(api.get("/api/v1/finance/summary/", {"month": "2026-11"}).data["profit_uzs"])
        Adjustment.objects.create(user=team["video"], kind="bonus", amount_uzs=100000, year=2026, month=11, reason="b")
        Adjustment.objects.create(user=team["video"], kind="advance", amount_uzs=70000, year=2026, month=11, reason="a")
        data = api.get("/api/v1/finance/summary/", {"month": "2026-11"}).data
        assert Decimal(data["profit_uzs"]) == before - 100000
        assert data["cash"]["advances_uzs"] == "70000.00"

    def test_by_client_adds_up_to_profit(self, rahbar, project, usd_rate, category):
        api = api_for(rahbar)
        issued_invoice(rahbar, project)
        api.post("/api/v1/finance/payments/", {**PAY, "client": project.client_id}, format="json")
        expense(api, category, project=project.pk)
        expense(api, category, amount="50000")
        rows = api.get("/api/v1/finance/by-client/", {"month": "2026-11"}).data
        profit = api.get("/api/v1/finance/summary/", {"month": "2026-11"}).data["profit_uzs"]
        assert sum(Decimal(r["profit_uzs"]) for r in rows) == Decimal(profit)
        assert any(r["client"].startswith("Umumiy") for r in rows)

    def test_partners_share_and_limit(self, rahbar, project, usd_rate, uzs):
        api = api_for(rahbar)
        issued_invoice(rahbar, project)
        api.post("/api/v1/finance/payments/", {**PAY, "client": project.client_id}, format="json")
        one = api.post("/api/v1/finance/partners/", {"name": "A", "share_percent": "60"}, format="json")
        assert api.post("/api/v1/finance/partners/", {"name": "B", "share_percent": "50"}, format="json").status_code == 400  # noqa: E501
        api.post("/api/v1/finance/partners/", {"name": "B", "share_percent": "40"}, format="json")
        taken = api.post("/api/v1/finance/withdrawals/", {"partner": one.data["id"], "amount": "200000",
                                                          "currency": "UZS", "taken_on": "2026-11-10",
                                                          "account": uzs.pk}, format="json")
        assert taken.status_code == 201, taken.data
        data = api.get("/api/v1/finance/summary/", {"month": "2026-11"}).data
        rows = {r["name"]: r for r in data["partners"]}
        assert Decimal(rows["A"]["share_uzs"]) == (Decimal(data["profit_uzs"]) * Decimal("0.6")).quantize(Decimal("0.01"))  # noqa: E501
        assert rows["A"]["taken_uzs"] == "200000.00"
        # Sherik puli foydani kamaytirmaydi, faqat kassadan chiqadi.
        assert balance(uzs) == Decimal("800000.00")

    def test_trend_has_twelve_months_across_year(self, rahbar):
        rows = api_for(rahbar).get("/api/v1/finance/trend/", {"month": "2026-03"}).data
        assert len(rows) == 12 and rows[0]["month"] == "2025-04" and rows[-1]["month"] == "2026-03"

    def test_csv_exports(self, rahbar, category):
        api = api_for(rahbar)
        expense(api, category, description="=HACK()")
        body = api.get("/api/v1/finance/export/expenses/", {"month": "2026-11"}).content.decode("utf-8")
        assert "'=HACK()" in body
        for kind in ("payments", "payroll", "clients"):
            assert api.get(f"/api/v1/finance/export/{kind}/", {"month": "2026-11"}).status_code == 200
        assert api.get("/api/v1/finance/export/yoq/", {"month": "2026-11"}).status_code == 400
        assert csv_safe("-1") == "'-1"

    def test_reopen_month_only_super_admin(self, rahbar):
        api = api_for(rahbar)
        api.post("/api/v1/finance/close-month/", {"month": "2026-11"}, format="json")
        assert api.post("/api/v1/finance/close-month/", {"month": "2026-11", "action": "reopen"},
                        format="json").status_code == 403
        boss = api_for(make_user("+998901110077", access.SUPER_ADMIN))
        assert boss.post("/api/v1/finance/close-month/", {"month": "2026-11", "action": "reopen"},
                         format="json").data["closed"] is False
        assert api.get("/api/v1/finance/summary/", {"month": "2026-11"}).data["is_closed"] is False


class TestPayments:
    def test_advance_then_allocate(self, rahbar, team, project, usd_rate):
        api = api_for(rahbar)
        payment = api.post("/api/v1/finance/payments/", {**PAY, "client": project.client_id}, format="json")
        assert payment.data["unallocated_amount"] == "1000.00"
        issued_invoice(rahbar, project)
        done = api.post(f"/api/v1/finance/payments/{payment.data['id']}/allocate-advance/")
        assert done.data["unallocated_amount"] == "0.00"

    def test_invoice_remind_once_a_day(self, rahbar, project, client_user):
        invoice = issued_invoice(rahbar, project)
        api = api_for(rahbar)
        assert api.post(f"/api/v1/finance/invoices/{invoice.pk}/remind/").data["sent"] == 1
        assert api.post(f"/api/v1/finance/invoices/{invoice.pk}/remind/").data["sent"] == 0


class TestPayroll:
    def _ready(self, rahbar, project):
        api = api_for(rahbar)
        issued_invoice(rahbar, project)
        api.post("/api/v1/finance/payments/", {**PAY, "client": project.client_id}, format="json")
        api.post("/api/v1/payroll/sheet/", {"month": "2026-11", "action": "approve"}, format="json")
        return api

    def test_overpay_blocked_and_cancel_restores(self, rahbar, team, project, usd_rate, uzs):
        api = self._ready(rahbar, project)
        pay = {"month": "2026-11", "action": "payout", "user": team["smm"].pk, "paid_on": "2026-11-10"}
        row = next(r for r in api.get("/api/v1/payroll/sheet/", {"month": "2026-11"}).data["rows"]
                   if r["user_id"] == team["smm"].pk)
        left = Decimal(row["remaining_uzs"])
        assert api.post("/api/v1/payroll/sheet/", {**pay, "amount_uzs": str(left + 1)}, format="json").status_code == 400  # noqa: E501
        done = api.post("/api/v1/payroll/sheet/", {**pay, "amount_uzs": str(left), "account": uzs.pk}, format="json")
        assert done.status_code == 200, done.data
        assert balance(uzs) == Decimal("1000000") - left
        payout = api.get("/api/v1/payroll/payouts/", {"month": "2026-11"}).data["results"][0]
        assert api.post(f"/api/v1/payroll/payouts/{payout['id']}/cancel/", {}, format="json").status_code == 400
        assert api.post(f"/api/v1/payroll/payouts/{payout['id']}/cancel/", {"reason": "Xato"}, format="json").status_code == 200  # noqa: E501
        assert balance(uzs) == Decimal("1000000")
        row = next(r for r in api.get("/api/v1/payroll/sheet/", {"month": "2026-11"}).data["rows"]
                   if r["user_id"] == team["smm"].pk)
        assert Decimal(row["remaining_uzs"]) == left


class TestFinanceReminders:
    def test_invoice_due_and_overdue(self, rahbar, project, client_user):
        from django.utils import timezone

        invoice = issued_invoice(rahbar, project)
        at = timezone.make_aware(timezone.datetime.combine(invoice.due_date, timezone.datetime.min.time()))
        invoices(at - timezone.timedelta(days=2))
        assert Notification.objects.filter(user=client_user, kind="invoice.due").count() == 1
        invoices(at + timezone.timedelta(days=1))
        invoices(at + timezone.timedelta(days=2))
        assert Notification.objects.filter(user=client_user, kind="invoice.overdue").count() == 1
        assert Notification.objects.filter(user=rahbar, kind="invoice.overdue").count() == 1
        invoices(at + timezone.timedelta(days=8))
        assert Notification.objects.filter(user=rahbar, kind="invoice.overdue").count() == 2

    def test_sheet_reminder(self, rahbar, project, usd_rate):
        from django.utils import timezone

        issued_invoice(rahbar, project)
        api_for(rahbar).post("/api/v1/finance/payments/", {**PAY, "client": project.client_id}, format="json")
        at = timezone.make_aware(timezone.datetime(2026, 12, 6, 10))
        payroll_sheet(at)
        payroll_sheet(at)
        assert Notification.objects.filter(user=rahbar, kind="payroll.sheet_due").count() == 1


class TestActivity:
    def test_describe(self):
        assert describe("POST", "/api/v1/content/briefs/5/send/") == ("content/briefs", "5", "TZ", "yubordi")
        assert describe("PATCH", "/api/v1/clients/3/")[3] == "o‘zgartirdi"
        assert describe("POST", "/api/v1/yoq/") is None

    def test_any_change_is_logged_once(self, team, project):
        api = api_for(team["smm"])
        api.post("/api/v1/tasks/", {"project": project.pk, "title": "Yangi vazifa", "due_date": "2026-11-05"},
                 format="json")
        rows = AuditLog.objects.filter(actor=team["smm"], entity_type="tasks")
        assert rows.count() == 1
        assert "Vazifa" in rows[0].comment and "qo‘shdi" in rows[0].comment

    def test_explicit_entry_not_doubled(self, rahbar, category):
        expense(api_for(rahbar), category)
        assert AuditLog.objects.filter(actor=rahbar, action="expense.create").count() == 1
        assert not AuditLog.objects.filter(actor=rahbar, action="api.post").exists()

    def test_reads_and_failures_not_logged(self, team):
        api = api_for(team["smm"])
        api.get("/api/v1/tasks/")
        api.post("/api/v1/tasks/", {}, format="json")
        assert not AuditLog.objects.filter(actor=team["smm"]).exists()

    def test_password_never_in_log(self, rahbar):
        api = api_for(rahbar)
        api.post("/api/v1/auth/password/", {"old_password": "maxfiy-eski", "new_password": "maxfiy-yangi-123"},
                 format="json")
        assert not AuditLog.objects.filter(comment__contains="maxfiy").exists()

    def test_only_management_sees_journal_with_filters(self, rahbar, team, project, category):
        boss = api_for(rahbar)
        expense(boss, category)
        api_for(team["smm"]).post("/api/v1/tasks/", {"project": project.pk, "title": "V", "due_date": "2026-11-05"},
                                  format="json")
        assert api_for(team["smm"]).get("/api/v1/audit/").status_code == 403
        finance = boss.get("/api/v1/audit/", {"section": "finance"}).data["results"]
        assert finance and all(r["section"] == "Moliya" for r in finance)
        assert finance[0]["label"] == "Xarajat kiritdi"
        by_person = boss.get("/api/v1/audit/", {"actor": team["smm"].pk}).data["results"]
        assert len(by_person) == 1 and by_person[0]["section"] == "Vazifalar"
        filters = boss.get("/api/v1/audit/filters/").data
        assert {a["id"] for a in filters["actors"]} >= {rahbar.pk, team["smm"].pk}
