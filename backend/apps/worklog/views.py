from django.db.models import Q
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.clients.selectors import visible_projects
from apps.worklog import models as wl
from apps.worklog.services import review
from common import access
from common.permissions import ObroPermission


class WorkLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    source_label = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = wl.WorkLogEntry
        fields = ["id", "user", "user_name", "project", "client_name", "date", "kind", "kind_label", "quantity",
                  "title", "link", "internal_note", "source", "source_label", "status", "status_label",
                  "client_visible", "content_item", "task", "approved_at", "created_at"]
        read_only_fields = ["user", "source", "status", "approved_at"]

    def validate_project(self, project):
        if not visible_projects(self.context["request"].user).filter(pk=project.pk).exists():
            raise serializers.ValidationError("Bu loyiha sizga biriktirilmagan")
        return project


class WorkLogViewSet(viewsets.ModelViewSet):
    serializer_class = WorkLogSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.WORKLOG_CREATE, "write": access.WORKLOG_CREATE,
                      "approve": access.WORKLOG_APPROVE, "reject": access.WORKLOG_APPROVE}
    filterset_fields = ["project", "user", "status", "date", "kind"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = wl.WorkLogEntry.objects.select_related("user", "project__client")
        qs = qs.filter(project__in=visible_projects(user))
        if not user.has_obro_perm(access.WORKLOG_APPROVE):
            qs = qs.filter(user=user)
        date_from = self.request.query_params.get("from")
        if date_from:
            qs = qs.filter(date__gte=date_from)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        # SMM menejer o'z yozuvini o'zi tasdiqlangan holda kiritadi, qolganlar tekshiruvga yuboradi.
        auto_approve = user.has_obro_perm(access.WORKLOG_APPROVE)
        serializer.save(user=user, source=wl.SOURCE_MANUAL,
                        status=wl.APPROVED if auto_approve else wl.SUBMITTED)

    def perform_update(self, serializer):
        entry = serializer.instance
        user = self.request.user
        if entry.user_id != user.id and not user.has_obro_perm(access.WORKLOG_APPROVE):
            raise PermissionDenied("Faqat o‘z yozuvingizni o‘zgartira olasiz")
        if entry.status == wl.APPROVED and not user.has_obro_perm(access.WORKLOG_APPROVE):
            raise PermissionDenied("Tasdiqlangan yozuvni o‘zgartirib bo‘lmaydi")
        serializer.save()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        entry = review(self.get_object(), by=request.user, approve=True,
                       client_visible=request.data.get("client_visible"))
        return Response(WorkLogSerializer(entry, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        entry = review(self.get_object(), by=request.user, approve=False)
        return Response(WorkLogSerializer(entry, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        qs = self.get_queryset().filter(status=wl.SUBMITTED).exclude(Q(user=request.user))
        return Response(WorkLogSerializer(qs[:200], many=True, context={"request": request}).data)
