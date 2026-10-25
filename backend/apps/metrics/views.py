from rest_framework import serializers, viewsets

from apps.clients.selectors import visible_clients, visible_projects
from apps.metrics.models import AdCampaign, AdStat, ContentMetric, MetricSnapshot
from common import access
from common.permissions import ObroPermission

PERMS = {"read": access.METRICS_VIEW, "write": access.METRICS_MANAGE}


class MetricSnapshotSerializer(serializers.ModelSerializer):
    account = serializers.CharField(source="social_account.__str__", read_only=True)

    class Meta:
        model = MetricSnapshot
        fields = ["id", "social_account", "account", "date", "followers", "reach", "impressions", "profile_visits",
                  "engagement_rate", "source", "created_at"]
        read_only_fields = ["source", "created_at"]

    def validate_social_account(self, account):
        if not visible_clients(self.context["request"].user).filter(pk=account.client_id).exists():
            raise serializers.ValidationError("Bu akkaunt sizga biriktirilmagan")
        return account


class ContentMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentMetric
        fields = ["id", "item", "date", "views", "likes", "comments", "saves", "shares", "source"]
        read_only_fields = ["source"]


class AdCampaignSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="project.client.name", read_only=True)

    class Meta:
        model = AdCampaign
        fields = ["id", "project", "client_name", "platform", "name", "objective", "status", "started_on", "ended_on"]

    def validate_project(self, project):
        if not visible_projects(self.context["request"].user).filter(pk=project.pk).exists():
            raise serializers.ValidationError("Bu loyiha sizga biriktirilmagan")
        return project


class AdStatSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdStat
        fields = ["id", "campaign", "date", "spend", "currency", "impressions", "clicks", "leads", "source"]
        read_only_fields = ["source"]


class MetricSnapshotViewSet(viewsets.ModelViewSet):
    serializer_class = MetricSnapshotSerializer
    permission_classes = [ObroPermission]
    required_perms = PERMS
    filterset_fields = ["social_account", "social_account__client"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return MetricSnapshot.objects.select_related("social_account").filter(
            social_account__client__in=visible_clients(self.request.user))


class ContentMetricViewSet(viewsets.ModelViewSet):
    serializer_class = ContentMetricSerializer
    permission_classes = [ObroPermission]
    required_perms = PERMS
    filterset_fields = ["item"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return ContentMetric.objects.filter(item__project__in=visible_projects(self.request.user))


class AdCampaignViewSet(viewsets.ModelViewSet):
    serializer_class = AdCampaignSerializer
    permission_classes = [ObroPermission]
    required_perms = PERMS
    filterset_fields = ["project", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return AdCampaign.objects.select_related("project__client").filter(
            project__in=visible_projects(self.request.user))


class AdStatViewSet(viewsets.ModelViewSet):
    serializer_class = AdStatSerializer
    permission_classes = [ObroPermission]
    required_perms = PERMS
    filterset_fields = ["campaign", "campaign__project"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return AdStat.objects.filter(campaign__project__in=visible_projects(self.request.user))
