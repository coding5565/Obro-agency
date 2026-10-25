from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.clients.selectors import visible_projects
from apps.tasks import models as tm
from apps.worklog.services import auto_entry
from common import access
from common.permissions import ObroPermission

# Vazifa lavozimi → jurnal yozuvi turi
POSITION_KIND = {"smm_target": "script", "video_mobilo": "shooting", "design_montage": "editing"}


class TaskSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True, default=None)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    content_title = serializers.CharField(source="content_item.title", read_only=True, default=None)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = tm.Task
        fields = ["id", "project", "client_name", "content_item", "content_title", "title", "description",
                  "assignee", "assignee_name", "position", "due_date", "status", "status_label", "priority",
                  "is_overdue", "created_at", "completed_at"]
        read_only_fields = ["completed_at"]

    def get_is_overdue(self, task):
        return bool(task.due_date and task.status in (tm.TODO, tm.IN_PROGRESS)
                    and task.due_date < timezone.localdate())

    def validate_project(self, project):
        if not visible_projects(self.context["request"].user).filter(pk=project.pk).exists():
            raise serializers.ValidationError("Bu loyiha sizga biriktirilmagan")
        return project


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.TASKS_VIEW, "write": access.TASKS_MANAGE, "my": access.TASKS_VIEW,
                      "set_status": access.TASKS_VIEW}
    filterset_fields = ["project", "assignee", "status", "content_item"]
    search_fields = ["title"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = tm.Task.objects.select_related("project__client", "assignee", "content_item")
        qs = qs.filter(project__in=visible_projects(user))
        if not user.has_obro_perm(access.TASKS_MANAGE):
            qs = qs.filter(Q(assignee=user) | Q(assignee__isnull=True))
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"])
    def my(self, request):
        qs = self.get_queryset().filter(assignee=request.user, status__in=[tm.TODO, tm.IN_PROGRESS])
        return Response(TaskSerializer(qs.order_by("due_date", "id"), many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        task = self.get_object()
        new_status = request.data.get("status")
        if new_status not in dict(tm.Task.STATUS_CHOICES):
            raise ValidationError({"status": "Noto‘g‘ri holat"})
        is_manager = request.user.has_obro_perm(access.TASKS_MANAGE)
        if task.assignee_id not in (request.user.id, None) and not is_manager:
            raise ValidationError({"status": "Bu vazifa sizga berilmagan"})
        if new_status == tm.DONE and task.status != tm.DONE:
            task.completed_at = timezone.now()
            if task.assignee_id is None:
                task.assignee = request.user
            kind = POSITION_KIND.get(task.position.code if task.position else "", "other")
            # Ish turi alohida ko'rsatiladi, sarlavhada faqat «nima ustida» qolsin.
            item = task.content_item
            title = f"{item.get_kind_display()} «{item.title}»" if item else task.title
            auto_entry(user=request.user, project=task.project, kind=kind, title=title, content_item=item, task=task)
        task.status = new_status
        task.save(update_fields=["status", "completed_at", "assignee"])
        return Response(TaskSerializer(task, context={"request": request}).data)
