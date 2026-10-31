from django.conf import settings
from rest_framework import serializers

from apps.clients.selectors import visible_projects
from apps.leads import models as lm


class LeadEventSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True, default="")

    class Meta:
        model = lm.LeadEvent
        fields = ["id", "kind", "text", "user_name", "created_at"]


class LeadSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default="")
    is_duplicate = serializers.BooleanField(read_only=True)
    response_minutes = serializers.SerializerMethodField()

    class Meta:
        model = lm.Lead
        fields = ["id", "project", "client_name", "source", "source_label", "full_name", "phone", "email", "city",
                  "message", "form_name", "campaign_name", "ad_name", "platform", "status", "status_label",
                  "assigned_to", "assigned_to_name", "is_duplicate", "duplicate_of", "first_response_at",
                  "response_minutes", "next_contact_at", "sale_amount", "sale_currency", "lost_reason", "created_at"]

    def get_response_minutes(self, lead):
        if not lead.first_response_at:
            return None
        return max(int((lead.first_response_at - lead.created_at).total_seconds() // 60), 0)


class LeadDetailSerializer(LeadSerializer):
    events = LeadEventSerializer(many=True, read_only=True)

    class Meta(LeadSerializer.Meta):
        fields = LeadSerializer.Meta.fields + ["events", "raw"]


class LeadSourceSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    webhook_url = serializers.SerializerMethodField()

    class Meta:
        model = lm.LeadSource
        fields = ["id", "project", "client_name", "name", "kind", "kind_label", "is_active", "default_assignee",
                  "telegram_chat_id", "received_count", "last_received_at", "created_at", "webhook_url"]
        read_only_fields = ["received_count", "last_received_at", "created_at"]

    def get_webhook_url(self, source):
        return f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/leads/hook/{source.token}/"

    def validate_project(self, project):
        if not visible_projects(self.context["request"].user).filter(pk=project.pk).exists():
            raise serializers.ValidationError("Bu loyiha sizga biriktirilmagan")
        return project
