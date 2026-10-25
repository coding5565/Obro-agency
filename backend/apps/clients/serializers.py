from rest_framework import serializers

from apps.accounts.serializers import PositionSerializer
from apps.clients.models import Client, ClientContact, ClientMembership, Project, ProjectAssignment, SocialAccount


class ClientContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientContact
        fields = ["id", "client", "full_name", "position", "phone", "email", "is_primary"]


class SocialAccountSerializer(serializers.ModelSerializer):
    platform_label = serializers.CharField(source="get_platform_display", read_only=True)

    class Meta:
        model = SocialAccount
        fields = ["id", "client", "platform", "platform_label", "username", "url", "followers_start"]


class ClientSerializer(serializers.ModelSerializer):
    niche_label = serializers.CharField(source="get_niche_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    contacts = ClientContactSerializer(many=True, read_only=True)
    social_accounts = SocialAccountSerializer(many=True, read_only=True)
    active_project = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = ["id", "name", "niche", "niche_label", "city", "status", "status_label", "source", "notes",
                  "contacts", "social_accounts", "active_project", "created_at"]

    def get_active_project(self, client):
        project = next((p for p in client.projects.all() if p.status == "active"), None)
        if project is None:
            return None
        return {"id": project.id, "tariff": project.tariff_version.tariff.name, "price": str(project.price),
                "currency": project.currency}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        # Ichki izoh faqat mijozlarni boshqaradiganlarga ko'rinadi.
        if request and not request.user.has_obro_perm("clients.manage"):
            data.pop("notes", None)
        return data


class AssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    position_detail = PositionSerializer(source="position", read_only=True)

    class Meta:
        model = ProjectAssignment
        fields = ["id", "project", "user", "user_name", "position", "position_detail", "share_percent",
                  "started_at", "ended_at"]

    def validate(self, attrs):
        user = attrs.get("user") or getattr(self.instance, "user", None)
        if user and user.is_client:
            raise serializers.ValidationError({"user": "Mijoz akkauntini jamoaga biriktirib bo‘lmaydi"})
        return attrs


class ProjectSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    tariff_name = serializers.CharField(source="tariff_version.tariff.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    monthly_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    assignments = AssignmentSerializer(many=True, read_only=True)
    limits = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "client", "client_name", "tariff_version", "tariff_name", "title", "price", "currency",
                  "discount_percent", "monthly_amount", "start_date", "end_date", "status", "status_label",
                  "contract_number", "contract_signed_at", "min_term_months", "notes", "assignments", "limits",
                  "created_at"]
        extra_kwargs = {"price": {"required": False}, "currency": {"required": False}}

    def get_limits(self, project):
        return project.tariff_version.limit_map()

    def validate(self, attrs):
        version = attrs.get("tariff_version")
        if version and self.instance is None:
            # Narx va valyuta tarif versiyasidan qotiriladi (qo'lda berilmagan bo'lsa).
            attrs.setdefault("price", version.price)
            attrs.setdefault("currency", version.currency)
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and not request.user.has_obro_perm("finance.manage"):
            for key in ("price", "discount_percent", "monthly_amount", "notes"):
                data.pop(key, None)
        return data


class MembershipSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)

    class Meta:
        model = ClientMembership
        fields = ["id", "user", "user_name", "phone", "client", "role", "can_see_payments"]
