from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.accounts.models import Invite, Position, User, UserPermissionOverride


class OverrideInline(admin.TabularInline):
    model = UserPermissionOverride
    extra = 0


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["full_name"]
    list_display = ["full_name", "phone", "role", "is_active"]
    list_filter = ["role", "is_active"]
    search_fields = ["full_name", "phone"]
    inlines = [OverrideInline]
    fieldsets = [
        (None, {"fields": ["phone", "password", "full_name", "email"]}),
        ("Rol", {"fields": ["role", "positions", "is_active", "is_staff", "is_superuser"]}),
        ("Telegram", {"fields": ["telegram_chat_id"]}),
    ]
    add_fieldsets = [(None, {"fields": ["phone", "full_name", "role", "password1", "password2"]})]
    filter_horizontal = ["positions"]


admin.site.register(Position)
admin.site.register(Invite)
