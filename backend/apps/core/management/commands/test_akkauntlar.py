"""Sinov serveri uchun: har bir rolga bittadan akkaunt va har biriga alohida tasodifiy parol.

    python manage.py test_akkauntlar            # birinchi marta: demo ma'lumot + akkauntlar
    python manage.py test_akkauntlar --reset    # parollarni yangilash

Parollar faqat shu buyruq chiqishida ko'rinadi (bazada xeshlangan holda saqlanadi).
GitHub'dagi seed_obro.py dagi umumiy demo parol serverda hech qachon ishlatilmaydi.
"""
import os
import secrets
import string

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User

ROLES = [
    ("+998900000001", "Super admin"),
    ("+998900000002", "Rahbar"),
    ("+998900000003", "SMM menejer"),
    ("+998900000004", "Videograf-mobilograf"),
    ("+998900000005", "Dizayner-montajyor"),
    ("+998900000006", "Mijoz (Namuna klinika)"),
]

ALPHABET = string.ascii_lowercase + string.digits


def new_password():
    # O'qish va yozish oson: 4-4-4 ko'rinishida, chalkash harflarsiz.
    clean = "".join(ch for ch in ALPHABET if ch not in "l1o0")
    return "-".join("".join(secrets.choice(clean) for _ in range(4)) for _ in range(3))


class Command(BaseCommand):
    help = "Har bir rol uchun sinov akkauntlarini yaratadi va parollarini chiqaradi"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Mavjud akkauntlar parolini yangilash")

    @transaction.atomic
    def handle(self, *args, **options):
        exists = User.objects.filter(phone=ROLES[0][0]).exists()
        if exists and not options["reset"]:
            self.stdout.write("Akkauntlar allaqachon bor. Parollarni yangilash uchun: test_akkauntlar --reset")
            return
        if not exists:
            os.environ["DEMO_PASSWORD"] = secrets.token_urlsafe(24)  # vaqtinchalik, pastda almashtiriladi
            call_command("seed_obro", demo=True, verbosity=0)
        lines = []
        for phone, label in ROLES:
            user = User.objects.get(phone=phone)
            password = new_password()
            user.set_password(password)
            user.is_active = True
            user.save(update_fields=["password", "is_active"])
            lines.append(f"{label:<26} {phone:<15} {password}")
        self.stdout.write("ROL                        TELEFON         PAROL")
        for line in lines:
            self.stdout.write(line)
