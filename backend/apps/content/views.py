from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.clients.selectors import visible_projects
from apps.content import services
from apps.content.models import Comment, ContentItem, ShootDay
from apps.content.serializers import (
    CommentSerializer,
    ContentItemDetailSerializer,
    ContentItemSerializer,
    ShootDaySerializer,
    VersionSerializer,
)
from apps.worklog.services import auto_entry
from common import access
from common.dates import parse_month
from common.permissions import ObroPermission


class ContentItemViewSet(viewsets.ModelViewSet):
    permission_classes = [ObroPermission]
    required_perms = {
        "read": access.CONTENT_VIEW, "write": access.CONTENT_MANAGE,
        "versions": access.CONTENT_UPLOAD, "comments": access.CONTENT_VIEW,
    }
    filterset_fields = ["project", "status", "kind"]
    search_fields = ["title"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = ContentItem.objects.filter(project__in=visible_projects(self.request.user)).select_related(
            "project__client", "project__tariff_version__tariff").prefetch_related("versions")
        month = self.request.query_params.get("month")  # 2026-11
        if month:
            year, mon = parse_month(month)
            qs = qs.filter(planned_date__year=year, planned_date__month=mon)
        return qs

    def get_serializer_class(self):
        return ContentItemDetailSerializer if self.action == "retrieve" else ContentItemSerializer

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        project = data.pop("project")
        item = services.create_item(project=project, by=self.request.user, **data)
        serializer.instance = item

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        item = self.get_object()
        services.set_status(item, request.data.get("status"), by=request.user)
        return Response(ContentItemSerializer(item, context={"request": request}).data)

    @action(detail=True, methods=["get", "post"])
    def versions(self, request, pk=None):
        item = self.get_object()
        if request.method == "GET":
            return Response(VersionSerializer(item.versions.all(), many=True, context={"request": request}).data)
        version = services.add_version(item, by=request.user, file=request.FILES.get("file"),
                                       link=request.data.get("link", ""), note=request.data.get("note", ""))
        return Response(VersionSerializer(version, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="send-to-client")
    def send_to_client(self, request, pk=None):
        item = services.send_to_client(self.get_object(), by=request.user)
        return Response(ContentItemSerializer(item, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        url = serializers.URLField(required=False, allow_blank=True).run_validation(request.data.get("url", ""))
        item = services.publish(self.get_object(), by=request.user, url=url)
        return Response(ContentItemSerializer(item, context={"request": request}).data)

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, pk=None):
        item = self.get_object()
        if request.method == "GET":
            return Response(CommentSerializer(item.comments.select_related("author"), many=True).data)
        body = (request.data.get("body") or "").strip()
        if not body:
            return Response({"body": "Izoh bo‘sh"}, status=status.HTTP_400_BAD_REQUEST)
        comment = Comment.objects.create(item=item, author=request.user, body=body, is_internal=True)
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class ShootDayViewSet(viewsets.ModelViewSet):
    serializer_class = ShootDaySerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CONTENT_VIEW, "write": access.CONTENT_MANAGE, "complete": access.CONTENT_UPLOAD}
    filterset_fields = ["project", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = ShootDay.objects.filter(project__in=visible_projects(self.request.user)).select_related("project__client")
        date_from = self.request.query_params.get("from")
        if date_from:
            qs = qs.filter(date__gte=date_from)
        return qs

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Suratga olish o'tkazildi: jurnalga yoziladi (mijozga «Suratga olindi: 4 Reels»)."""
        shoot = self.get_object()
        if shoot.status == "done":
            return Response({"status": "Allaqachon o‘tkazilgan"}, status=status.HTTP_400_BAD_REQUEST)
        shoot.status = "done"
        shoot.save(update_fields=["status"])
        count = shoot.planned_items.count() or 1
        auto_entry(user=request.user, project=shoot.project, kind="shooting", quantity=count,
                   title=f"{count} ta kontent uchun material")
        return Response(ShootDaySerializer(shoot, context={"request": request}).data)
