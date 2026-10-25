from datetime import date
from decimal import Decimal

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import Position, User
from apps.catalog.models import Tariff
from apps.clients.models import Client, ClientMembership, Project, ProjectAssignment
from apps.finance.models import ExchangeRate
from common import access

PASSWORD = "test-parol-12345"
START = date(2026, 11, 1)


@pytest.fixture(autouse=True)
def seed(db):
    call_command("seed_obro", verbosity=0)


def make_user(phone, role, *position_codes, name=None):
    user = User.objects.create_user(phone, PASSWORD, full_name=name or phone, role=role)
    user.positions.set(Position.objects.filter(code__in=position_codes))
    return user


def api_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def rahbar(db):
    return make_user("+998901110001", access.RAHBAR, name="Rahbar")


@pytest.fixture
def team(db):
    return {
        "smm": make_user("+998901110002", access.SMM, Position.SMM_TARGET, name="SMM"),
        "video": make_user("+998901110003", access.CREATOR, Position.VIDEO_MOBILO, name="Video"),
        "design": make_user("+998901110004", access.CREATOR, Position.DESIGN_MONTAGE, name="Dizayn"),
    }


def make_project(name, tariff_code, team=None, start=START):
    client = Client.objects.create(name=name, status="active")
    version = Tariff.objects.get(code=tariff_code).current_version(start)
    project = Project.objects.create(client=client, tariff_version=version, price=version.price,
                                     currency=version.currency, start_date=start)
    for user in (team or {}).values():
        ProjectAssignment.objects.create(project=project, user=user, position=user.positions.first(),
                                         started_at=start)
    return project


@pytest.fixture
def project(team):
    return make_project("Klinika A", "standard", team)


@pytest.fixture
def other_project(db):
    return make_project("Restoran B", "premium")


@pytest.fixture
def client_user(project):
    user = make_user("+998901110010", access.CLIENT_OWNER, name="Mijoz A")
    ClientMembership.objects.create(user=user, client=project.client)
    return user


@pytest.fixture
def usd_rate(db):
    return ExchangeRate.objects.create(date=date(2026, 10, 30), currency="USD", rate_to_uzs=Decimal("12650"))
