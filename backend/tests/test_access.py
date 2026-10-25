"""Ruxsatlar: kim nimani ko'radi. Bu testlar o'tmasa, reliz qilinmaydi."""
from apps.accounts.models import UserPermissionOverride
from apps.clients.models import ClientMembership
from common import access
from tests.conftest import PASSWORD, api_for, make_user


def test_login_sets_httponly_refresh_cookie_and_refresh_works(rahbar):
    from rest_framework.test import APIClient

    api = APIClient()
    response = api.post("/api/v1/auth/login/", {"phone": "90 111 00 01", "password": PASSWORD}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["access"]
    cookie = response.cookies["obro_refresh"]
    assert cookie["httponly"]
    assert "refresh" not in response.data
    refreshed = api.post("/api/v1/auth/refresh/")
    assert refreshed.status_code == 200
    assert refreshed.data["user"]["role"] == access.RAHBAR


def test_wrong_password(rahbar):
    from rest_framework.test import APIClient

    response = APIClient().post("/api/v1/auth/login/", {"phone": rahbar.phone, "password": "xato"}, format="json")
    assert response.status_code == 401


def test_client_cannot_use_internal_api(client_user):
    api = api_for(client_user)
    for url in ["/api/v1/clients/", "/api/v1/projects/", "/api/v1/finance/invoices/", "/api/v1/payroll/accruals/",
                "/api/v1/content/items/", "/api/v1/dashboard/"]:
        assert api.get(url).status_code == 403, url


def test_client_sees_only_own_company(client_user, project, other_project):
    other_owner = make_user("+998901110011", access.CLIENT_OWNER)
    ClientMembership.objects.create(user=other_owner, client=other_project.client)
    response = api_for(client_user).get("/api/v1/portal/dashboard/")
    assert response.status_code == 200
    assert response.data["client"]["name"] == "Klinika A"
    # Boshqa mijoz id'sini berib ham ko'rib bo'lmaydi
    hijack = api_for(client_user).get(f"/api/v1/portal/dashboard/?client={other_project.client_id}")
    assert hijack.status_code == 404


def test_staff_sees_only_assigned_projects(team, project, other_project):
    response = api_for(team["video"]).get("/api/v1/projects/")
    ids = [p["id"] for p in response.data["results"]]
    assert ids == [project.id]


def test_creator_cannot_see_payroll_or_finance(team, project):
    api = api_for(team["design"])
    assert api.get("/api/v1/payroll/accruals/").status_code == 403
    assert api.get("/api/v1/payroll/rules/").status_code == 403
    assert api.get("/api/v1/finance/invoices/").status_code == 403
    assert api.get("/api/v1/finance/summary/").status_code == 403
    assert api.get("/api/v1/payroll/me/").status_code == 200


def test_smm_sees_debt_status_without_amounts(team, project):
    response = api_for(team["smm"]).get("/api/v1/finance/debts/")
    assert response.status_code == 200
    projects = api_for(team["smm"]).get(f"/api/v1/projects/{project.id}/").data
    assert "price" not in projects


def test_deny_override_beats_role(team, project):
    UserPermissionOverride.objects.create(user=team["smm"], permission=access.CONTENT_MANAGE, effect="deny")
    response = api_for(team["smm"]).post("/api/v1/content/items/", {"project": project.id, "title": "X"},
                                         format="json")
    assert response.status_code == 403


def test_allow_override_adds_permission(team, project):
    UserPermissionOverride.objects.create(user=team["video"], permission=access.FINANCE_MANAGE, effect="allow")
    assert api_for(team["video"]).get("/api/v1/finance/invoices/").status_code == 200


def test_deactivated_user_loses_access(rahbar, team):
    api_for(rahbar).post(f"/api/v1/users/{team['smm'].id}/deactivate/")
    team["smm"].refresh_from_db()
    assert not team["smm"].is_active
    assert api_for(team["smm"]).get("/api/v1/tasks/").status_code in (401, 403)


def test_rahbar_cannot_touch_super_admin(rahbar):
    boss = make_user("+998901110099", access.SUPER_ADMIN)
    api = api_for(rahbar)
    assert api.post(f"/api/v1/users/{boss.id}/deactivate/").status_code == 403
    assert api.patch(f"/api/v1/users/{boss.id}/", {"full_name": "X"}, format="json").status_code == 403
    staff = make_user("+998901110098", access.CREATOR)
    assert api.patch(f"/api/v1/users/{staff.id}/", {"role": access.SUPER_ADMIN}, format="json").status_code == 403
    boss.refresh_from_db()
    assert boss.is_active


def test_payroll_rules_list_has_clean_titles(rahbar):
    rows = api_for(rahbar).get("/api/v1/payroll/rules/").data
    assert rows and all(row["project_title"] is None for row in rows)


def test_basic_client_has_no_worklog_section(team):
    from tests.conftest import make_project

    basic = make_project("Kafe C", "basic", team)
    owner = make_user("+998901110012", access.CLIENT_OWNER)
    ClientMembership.objects.create(user=owner, client=basic.client)
    api = api_for(owner)
    assert api.get("/api/v1/portal/calendar/").status_code == 200
    assert api.get("/api/v1/portal/invoices/").status_code == 200
    assert api.get("/api/v1/portal/worklog/").status_code == 403
    assert api.get("/api/v1/portal/metrics/").status_code == 403


def test_invite_flow_creates_client_owner(rahbar, project):
    from rest_framework.test import APIClient

    response = api_for(rahbar).post("/api/v1/invites/", {
        "phone": "+998 93 000 00 99", "full_name": "Yangi mijoz", "role": access.CLIENT_OWNER,
        "client": project.client_id,
    }, format="json")
    assert response.status_code == 201, response.data
    token = response.data["link"].rsplit("/", 1)[-1]
    accepted = APIClient().post(f"/api/v1/auth/invite/{token}/", {"password": "Kuchli-parol-2026"}, format="json")
    assert accepted.status_code == 200, accepted.data
    assert accepted.data["user"]["clients"][0]["name"] == "Klinika A"
    again = APIClient().post(f"/api/v1/auth/invite/{token}/", {"password": "Kuchli-parol-2026"}, format="json")
    assert again.status_code == 410
