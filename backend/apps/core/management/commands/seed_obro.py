"""Boshlang'ich ma'lumotlar: lavozimlar, tariflar (tijoriy taklif 2026), maosh qoidalari, kategoriyalar.

    python manage.py seed_obro            # faqat ma'lumotnomalar
    python manage.py seed_obro --demo     # + sinov uchun xodimlar, namuna mijoz va kontent

Demo akkauntlar paroli DEMO_PASSWORD muhit o'zgaruvchisidan olinadi (berilmasa pastdagi qiymat).
Bu faqat lokal sinov uchun. Serverda --demo ishlatilmaydi.
"""
import os
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Position, User
from apps.catalog.models import BASIC_FEATURES, FULL_FEATURES, Service, Tariff, TariffLimit, TariffVersion
from apps.clients.models import Client, ClientMembership, Project, ProjectAssignment, SocialAccount
from apps.content import services as content_services
from apps.finance.models import CashAccount, ExchangeRate, ExpenseCategory
from apps.metrics.models import AdCampaign, AdStat, MetricSnapshot
from apps.payroll.models import CompensationRule
from common import access

DEMO_PASSWORD_DEFAULT = "obro-demo-2026"
RULES_VALID_FROM = date(2026, 10, 1)

POSITIONS = [
    (Position.SMM_TARGET, "SMM menejer (SMM + target)", True, 1),
    (Position.VIDEO_MOBILO, "Videograf-mobilograf", True, 2),
    (Position.DESIGN_MONTAGE, "Dizayner-montajyor", True, 3),
    (Position.BRANDFACE, "Brendfeys", False, 4),
    (Position.FREELANCER, "Frilanser", False, 5),
]

# OBRO Agency — Tijoriy taklif (2026-yil 25-oktabr)
TARIFFS = [
    ("basic", "Basic", "Yangi bizneslar va shaxsiy brendlar uchun", Decimal("800"),
     {"post": 4, "stories": 15, "reels": 10}, BASIC_FEATURES),
    ("standard", "Standard", "Rivojlanayotgan bizneslar uchun. Bonus: studiya + CRM", Decimal("1000"),
     {"post": 6, "stories": 20, "reels": 12}, FULL_FEATURES),
    ("premium", "Premium", "Marketingga jiddiy investitsiya qilayotganlar uchun. Bonus: studiya + CRM",
     Decimal("1500"), {"post": 10, "stories": 20, "reels": 15}, FULL_FEATURES + ["weekly_review"]),
]

PAY_RULES = [(Position.SMM_TARGET, Decimal("20")), (Position.VIDEO_MOBILO, Decimal("12.5")),
             (Position.DESIGN_MONTAGE, Decimal("12.5"))]

SERVICES = [("Video suratga olish", "day"), ("Model yoki brendfeys", "video"), ("Lokatsiya", "piece"),
            ("Qo‘shimcha ishlab chiqarish (dizayn, animatsiya, 3D)", "piece")]

EXPENSE_CATEGORIES = ["Ijara", "Uskuna", "Dasturlar va obunalar", "O‘z reklamamiz", "Brendfeys", "Frilanser",
                      "Transport", "Soliq", "Boshqa"]


class Command(BaseCommand):
    help = "OBRO’ Panel uchun boshlang‘ich ma’lumotlarni yaratadi"

    def add_arguments(self, parser):
        parser.add_argument("--demo", action="store_true", help="Sinov uchun namuna ma'lumotlar")

    @transaction.atomic
    def handle(self, *args, **options):
        positions = self._positions()
        self._tariffs()
        self._rules(positions)
        for name, unit in SERVICES:
            Service.objects.get_or_create(name=name, defaults={"unit": unit, "price_negotiable": True})
        for i, name in enumerate(EXPENSE_CATEGORIES):
            ExpenseCategory.objects.get_or_create(name=name, defaults={"sort": i})
        for name, kind in [("Naqd kassa", "cash"), ("Karta", "card"), ("Bank hisobi", "bank")]:
            CashAccount.objects.get_or_create(name=name, defaults={"kind": kind})
        self.stdout.write(self.style.SUCCESS("Ma’lumotnomalar tayyor."))
        if options["demo"]:
            self._demo(positions)

    def _positions(self):
        result = {}
        for code, name, team_share, sort in POSITIONS:
            result[code], _ = Position.objects.update_or_create(
                code=code, defaults={"name": name, "is_team_share": team_share, "sort": sort})
        return result

    def _tariffs(self):
        for sort, (code, name, description, price, limits, features) in enumerate(TARIFFS, start=1):
            tariff, _ = Tariff.objects.update_or_create(
                code=code, defaults={"name": name, "description": description, "sort": sort})
            version, created = TariffVersion.objects.get_or_create(
                tariff=tariff, valid_from=RULES_VALID_FROM,
                defaults={"price": price, "currency": "USD", "panel_features": features, "revisions_per_item": 2},
            )
            if created:
                TariffLimit.objects.bulk_create(
                    [TariffLimit(version=version, content_kind=k, quantity=v) for k, v in limits.items()])

    def _rules(self, positions):
        for code, percent in PAY_RULES:
            CompensationRule.objects.get_or_create(
                position=positions[code], valid_from=RULES_VALID_FROM, tariff=None, project=None,
                defaults={"percent": percent, "note": "Har loyihadan foiz (2026-yil 25-oktabr qarori)"},
            )

    def _demo(self, positions):
        password = os.environ.get("DEMO_PASSWORD", DEMO_PASSWORD_DEFAULT)
        today = timezone.localdate()

        def user(phone, name, role, *codes):
            obj, created = User.objects.get_or_create(phone=phone, defaults={"full_name": name, "role": role})
            if created:
                obj.set_password(password)
                obj.is_staff = role == access.SUPER_ADMIN
                obj.is_superuser = role == access.SUPER_ADMIN
                obj.save()
            obj.positions.set([positions[c] for c in codes])
            return obj

        user("+998900000001", "Super Admin (demo)", access.SUPER_ADMIN)
        user("+998900000002", "Rahbar (demo)", access.RAHBAR)
        smm = user("+998900000003", "SMM menejer (demo)", access.SMM, Position.SMM_TARGET)
        video = user("+998900000004", "Videograf (demo)", access.CREATOR, Position.VIDEO_MOBILO)
        design = user("+998900000005", "Dizayner (demo)", access.CREATOR, Position.DESIGN_MONTAGE)
        client_user = user("+998900000006", "Mijoz egasi (demo)", access.CLIENT_OWNER)

        client, _ = Client.objects.get_or_create(name="Namuna klinika",
                                                 defaults={"niche": "clinic", "status": "active"})
        ClientMembership.objects.get_or_create(user=client_user, client=client)
        account, _ = SocialAccount.objects.get_or_create(
            platform="instagram", username="namuna.klinika", defaults={"client": client, "followers_start": 11840})
        version = Tariff.objects.get(code="standard").current_version(today)
        start = today.replace(day=1)
        project, created = Project.objects.get_or_create(
            client=client, tariff_version=version,
            defaults={"price": version.price, "currency": version.currency, "start_date": start},
        )
        if created:
            for member, code in [(smm, Position.SMM_TARGET), (video, Position.VIDEO_MOBILO),
                                 (design, Position.DESIGN_MONTAGE)]:
                ProjectAssignment.objects.create(project=project, user=member, position=positions[code],
                                                 started_at=start)
            plan = [("reels", "Shifokor maslahati"), ("reels", "Navbatsiz qabul"), ("post", "Noyabr aksiyasi"),
                    ("reels", "Davolanish 3 bosqichda"), ("stories", "Bugungi qabul"),
                    ("post", "Jamoa bilan tanishing")]
            for i, (kind, title) in enumerate(plan):
                content_services.create_item(project=project, by=smm, kind=kind, title=title,
                                             planned_date=start + timedelta(days=2 + i * 4))
            ExchangeRate.objects.get_or_create(date=today, currency="USD", defaults={"rate_to_uzs": Decimal("12650")})
            for weeks, followers in enumerate([11840, 11920, 12050, 12210, 12480]):
                MetricSnapshot.objects.get_or_create(
                    social_account=account, date=today - timedelta(days=7 * (4 - weeks)),
                    defaults={"followers": followers, "reach": 30000 + weeks * 4500, "engagement_rate": Decimal("3.4")})
            campaign = AdCampaign.objects.create(project=project, name="Navbatsiz qabul — lidlar", started_on=start)
            AdStat.objects.create(campaign=campaign, date=today, spend=Decimal("85"), leads=46, clicks=610,
                                  impressions=48200)
        self.stdout.write(self.style.SUCCESS(
            "Demo tayyor. Telefonlar +998900000001…06, parol: DEMO_PASSWORD (yoki seed_obro.py dagi qiymat)."))
