from django.utils import timezone
from rest_framework import serializers

from apps.clients.selectors import visible_projects
from apps.content.briefs import clean_shot_list
from apps.content.models import Approval, Brief, Comment, ContentItem, ContentVersion, ShootDay
from apps.content.services import revisions_left
from apps.content.shoots import conflicts
from common.files import signed_version_url


class VersionSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True, default=None)
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = ContentVersion
        fields = ["id", "number", "file_url", "file_name", "link", "note", "client_visible", "uploaded_by_name",
                  "created_at"]
        read_only_fields = ["number", "client_visible", "created_at"]

    def get_file_url(self, version):
        request = self.context.get("request")
        return signed_version_url(request, version) if request else None

    def get_file_name(self, version):
        return version.file.name.rsplit("/", 1)[-1] if version.file else None


class ApprovalSerializer(serializers.ModelSerializer):
    decided_by_name = serializers.CharField(source="decided_by.full_name", read_only=True)
    version_number = serializers.IntegerField(source="version.number", read_only=True)

    class Meta:
        model = Approval
        fields = ["id", "version_number", "decision", "comment", "timecode", "decided_by_name", "created_at"]


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "body", "is_internal", "author_name", "created_at"]


class ContentItemSerializer(serializers.ModelSerializer):
    project_title = serializers.CharField(source="project.__str__", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    latest_version = VersionSerializer(read_only=True)
    revisions_left = serializers.SerializerMethodField()

    class Meta:
        model = ContentItem
        fields = ["id", "project", "project_title", "client_name", "kind", "kind_label", "title", "caption",
                  "internal_notes", "planned_date", "status", "status_label", "platform", "published_at",
                  "published_url", "counts_toward_limit", "revisions_used", "revisions_left", "latest_version",
                  "created_at", "updated_at"]
        read_only_fields = ["status", "published_at", "published_url", "revisions_used"]

    def get_revisions_left(self, item):
        return revisions_left(item)

    def validate_project(self, project):
        request = self.context["request"]
        if not visible_projects(request.user).filter(pk=project.pk).exists():
            raise serializers.ValidationError("Bu loyiha sizga biriktirilmagan")
        return project


class ContentItemDetailSerializer(ContentItemSerializer):
    versions = serializers.SerializerMethodField()
    approvals = serializers.SerializerMethodField()
    comments = CommentSerializer(many=True, read_only=True)

    class Meta(ContentItemSerializer.Meta):
        fields = ContentItemSerializer.Meta.fields + ["versions", "approvals", "comments"]

    def get_versions(self, item):
        return VersionSerializer(item.versions.all(), many=True, context=self.context).data

    def get_approvals(self, item):
        qs = Approval.objects.filter(version__item=item).select_related("decided_by", "version")
        return ApprovalSerializer(qs, many=True).data


class ShootDaySerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    participant_names = serializers.SerializerMethodField()
    conflicts = serializers.SerializerMethodField()
    open_briefs = serializers.SerializerMethodField()

    class Meta:
        model = ShootDay
        fields = ["id", "project", "client_name", "date", "start_time", "end_time", "location", "participants",
                  "participant_names", "brandface_name", "brandface_videos", "planned_items", "status",
                  "status_label", "notes", "client_prep", "client_confirmed_at", "conflicts", "open_briefs"]
        read_only_fields = ["status", "client_confirmed_at"]

    def validate_project(self, project):
        if not visible_projects(self.context["request"].user).filter(pk=project.pk).exists():
            raise serializers.ValidationError("Bu loyiha sizga biriktirilmagan")
        return project

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end_time": "Tugash vaqti boshlanishdan keyin bo‘lsin"})
        return attrs

    def get_participant_names(self, shoot):
        return [u.full_name for u in shoot.participants.all()]

    def get_conflicts(self, shoot):
        return conflicts(shoot)

    def get_open_briefs(self, shoot):
        return shoot.briefs.exclude(status__in=[Brief.DONE, Brief.CANCELLED]).count()


class BriefSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    content_title = serializers.CharField(source="content_item.title", read_only=True, default="")
    shoot_date = serializers.DateField(source="shoot_day.date", read_only=True, default=None)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Brief
        fields = ["id", "project", "client_name", "content_item", "content_title", "shoot_day", "shoot_date", "title",
                  "assignee", "assignee_name", "goal", "script", "shot_list", "format", "references", "location",
                  "talent", "notes", "deadline", "status", "status_label", "review_comment", "created_by_name",
                  "created_at", "updated_at", "sent_at", "seen_at", "completed_at", "is_overdue"]
        read_only_fields = ["status", "review_comment", "created_at", "updated_at", "sent_at", "seen_at",
                            "completed_at"]

    def get_is_overdue(self, brief):
        return bool(brief.deadline and brief.deadline < timezone.now() and brief.status in Brief.OPEN)

    def validate_shot_list(self, rows):
        return clean_shot_list(rows)

    def validate(self, attrs):
        project = attrs.get("project", getattr(self.instance, "project", None))
        if not visible_projects(self.context["request"].user).filter(pk=project.pk).exists():
            raise serializers.ValidationError({"project": "Bu loyiha sizga biriktirilmagan"})
        item = attrs.get("content_item")
        if item and item.project_id != project.pk:
            raise serializers.ValidationError({"content_item": "Kontent boshqa loyihaga tegishli"})
        shoot = attrs.get("shoot_day")
        if shoot and shoot.project_id != project.pk:
            raise serializers.ValidationError({"shoot_day": "Syomka boshqa loyihaga tegishli"})
        assignee = attrs.get("assignee")
        if assignee and not project.assignments.filter(user=assignee, ended_at__isnull=True).exists():
            raise serializers.ValidationError({"assignee": "Bu xodim shu loyihaga biriktirilmagan"})
        return attrs
