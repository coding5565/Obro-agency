import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from common import access


class Position(models.Model):
    """Maosh uchun lavozim. Bir xodimda bir nechta lavozim bo'lishi mumkin."""

    SMM_TARGET = "smm_target"
    VIDEO_MOBILO = "video_mobilo"
    DESIGN_MONTAGE = "design_montage"
    BRANDFACE = "brandface"
    FREELANCER = "freelancer"

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    is_team_share = models.BooleanField(default=True, help_text="Loyiha to'lovidan foiz oladimi")
    sort = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort", "name"]

    def __str__(self):
        return self.name


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, phone, password=None, **extra):
        if not phone:
            raise ValueError("Telefon raqami kerak")
        user = self.model(phone=normalize_phone(phone), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault("role", access.SUPER_ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(phone, password, **extra)


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(digits) == 9:
        digits = "998" + digits
    return "+" + digits


class User(AbstractBaseUser, PermissionsMixin):
    phone = models.CharField("Telefon", max_length=20, unique=True)
    email = models.EmailField(blank=True)
    full_name = models.CharField("Ism familiya", max_length=150)
    role = models.CharField(max_length=20, choices=access.ROLE_CHOICES, default=access.CREATOR)
    positions = models.ManyToManyField(Position, blank=True, related_name="users")
    telegram_chat_id = models.BigIntegerField(null=True, blank=True, unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False, help_text="Django admin paneliga kira oladimi")
    date_joined = models.DateTimeField(default=timezone.now)
    deactivated_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name or self.phone

    @property
    def is_client(self):
        return self.role in access.CLIENT_ROLES

    @property
    def sees_all_projects(self):
        return self.role in access.SEES_ALL_PROJECTS

    def get_permissions(self) -> set:
        if not hasattr(self, "_perm_cache"):
            overrides = [(o.permission, o.effect) for o in self.permission_overrides.all()]
            self._perm_cache = access.effective_permissions(self.role, overrides)
        return self._perm_cache

    def has_obro_perm(self, code: str) -> bool:
        return self.is_active and code in self.get_permissions()


class UserPermissionOverride(models.Model):
    ALLOW = "allow"
    DENY = "deny"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="permission_overrides")
    permission = models.CharField(max_length=40, choices=[(p, p) for p in access.ALL_PERMISSIONS])
    effect = models.CharField(max_length=5, choices=[(ALLOW, "Ruxsat"), (DENY, "Taqiq")])

    class Meta:
        unique_together = [("user", "permission")]


def _invite_token():
    return secrets.token_urlsafe(32)


def _invite_expiry():
    return timezone.now() + timedelta(days=7)


class Invite(models.Model):
    """Taklif havolasi: rahbar xodim yoki mijoz uchun yaratadi, odam o'zi parol qo'yadi."""

    token = models.CharField(max_length=64, unique=True, default=_invite_token)
    phone = models.CharField(max_length=20)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=access.ROLE_CHOICES)
    positions = models.ManyToManyField(Position, blank=True)
    client = models.ForeignKey("clients.Client", null=True, blank=True, on_delete=models.CASCADE)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=_invite_expiry)
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    @property
    def is_usable(self):
        return self.accepted_at is None and self.expires_at > timezone.now()
