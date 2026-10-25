from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.accounts.models import Invite, Position, User, normalize_phone
from apps.catalog.models import PANEL_FEATURES
from common import access


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = ["id", "code", "name", "is_team_share"]


class UserSerializer(serializers.ModelSerializer):
    positions = PositionSerializer(many=True, read_only=True)
    position_ids = serializers.PrimaryKeyRelatedField(
        source="positions", queryset=Position.objects.all(), many=True, write_only=True, required=False,
    )
    role_label = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = ["id", "phone", "email", "full_name", "role", "role_label", "positions", "position_ids",
                  "is_active", "date_joined", "last_login"]
        read_only_fields = ["phone", "date_joined", "last_login", "is_active"]


class MeSerializer(serializers.ModelSerializer):
    positions = PositionSerializer(many=True, read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    permissions = serializers.SerializerMethodField()
    clients = serializers.SerializerMethodField()
    is_client = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "phone", "email", "full_name", "role", "role_label", "positions", "permissions",
                  "is_client", "clients"]

    def get_permissions(self, user):
        return sorted(user.get_permissions())

    def get_clients(self, user):
        if not user.is_client:
            return []
        result = []
        for membership in user.client_memberships.select_related("client"):
            project = (membership.client.projects.filter(status="active")
                       .select_related("tariff_version__tariff").first())
            features = project.tariff_version.panel_features if project else []
            result.append({
                "id": membership.client_id,
                "name": membership.client.name,
                "role": membership.role,
                "can_see_payments": membership.can_see_payments,
                "tariff": project.tariff_version.tariff.name if project else None,
                "features": [f for f in features if f in PANEL_FEATURES],
            })
        return result


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate_phone(self, value):
        return normalize_phone(value)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError({"old_password": "Eski parol noto‘g‘ri"})
        validate_password(attrs["new_password"], user)
        return attrs


class InviteSerializer(serializers.ModelSerializer):
    position_ids = serializers.PrimaryKeyRelatedField(
        source="positions", queryset=Position.objects.all(), many=True, required=False,
    )
    link = serializers.SerializerMethodField()
    is_usable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invite
        fields = ["id", "phone", "full_name", "role", "position_ids", "client", "created_at", "expires_at",
                  "accepted_at", "is_usable", "link"]
        read_only_fields = ["created_at", "expires_at", "accepted_at"]

    def get_link(self, invite):
        from django.conf import settings

        return f"{settings.FRONTEND_URL}/invite/{invite.token}" if invite.is_usable else None

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("Bu raqam bilan foydalanuvchi allaqachon bor")
        return phone

    def validate(self, attrs):
        role = attrs.get("role")
        request = self.context["request"]
        if role in access.CLIENT_ROLES and not attrs.get("client"):
            raise serializers.ValidationError({"client": "Mijoz akkaunti uchun mijozni tanlang"})
        if role == access.SUPER_ADMIN and request.user.role != access.SUPER_ADMIN:
            raise serializers.ValidationError({"role": "Super adminni faqat super admin qo‘sha oladi"})
        return attrs


class AcceptInviteSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value
