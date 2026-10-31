from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.clients.selectors import visible_projects
from apps.content import briefs, services, shoots
from apps.content.models import Brief, Comment, ContentItem, ShootDay
from apps.content.serializers import (
    BriefSerializer,
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
        qs = (ShootDay.objects.filter(project__in=visible_projects(self.request.user))
              .select_related("project__client").prefetch_related("participants"))
        date_from = self.request.query_params.get("from")
        if date_from:
            qs = qs.filter(date__gte=date_from)
        date_to = self.request.query_params.get("to")
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        shoots.announce_created(serializer.save(created_by=self.request.user))

    def perform_update(self, serializer):
        before = serializer.instance
        was = (before.date, before.start_time, before.location)
        shoot = serializer.save()
        if was != (shoot.date, shoot.start_time, shoot.location) and shoot.status == "planned":
            shoots.announce_changed(shoot)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        shoot = self.get_object()
        if shoot.status != "planned":
            return Response({"status": "Faqat rejadagi syomka bekor qilinadi"}, status=status.HTTP_400_BAD_REQUEST)
        reason = (request.data.get("reason") or "").strip()
        shoot.status = "cancelled"
        if reason:
            shoot.notes = f"{shoot.notes}\nBekor qilish sababi: {reason}".strip()
        shoot.save(update_fields=["status", "notes"])
        shoots.announce_cancelled(shoot)
        return Response(ShootDaySerializer(shoot, context={"request": request}).data)

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


class BriefViewSet(viewsets.ModelViewSet):
    """TZ. Menejer hammasini ko'radi, ijodkor faqat o'ziga yuborilganini. Mijozga hech qachon ko'rinmaydi."""

    serializer_class = BriefSerializer
    permission_classes = [ObroPermission]
    required_perms = {
        "read": access.CONTENT_VIEW, "write": access.CONTENT_MANAGE,
        "accept": access.CONTENT_VIEW, "submit": access.CONTENT_VIEW, "shot": access.CONTENT_VIEW,
    }
    filterset_fields = ["project", "status", "assignee", "content_item", "shoot_day"]
    search_fields = ["title"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = (Brief.objects.filter(project__in=visible_projects(user))
              .select_related("project__client", "assignee", "created_by", "content_item", "shoot_day"))
        if not user.has_obro_perm(access.CONTENT_MANAGE):
            qs = qs.filter(assignee=user).exclude(status=Brief.DRAFT)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        brief = briefs.mark_seen(self.get_object(), by=request.user)
        return Response(self.get_serializer(brief).data)

    def _result(self, brief):
        return Response(self.get_serializer(brief).data)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        return self._result(briefs.send(self.get_object(), by=request.user))

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        return self._result(briefs.accept(self.get_object(), by=request.user))

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return self._result(briefs.submit(self.get_object(), by=request.user))

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._result(briefs.approve(self.get_object(), by=request.user))

    @action(detail=True, methods=["post"], url_path="return")
    def return_back(self, request, pk=None):
        return self._result(briefs.return_back(self.get_object(), by=request.user,
                                               comment=request.data.get("comment", "")))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._result(briefs.cancel(self.get_object(), by=request.user))

    @action(detail=True, methods=["post"])
    def shot(self, request, pk=None):
        try:
            index = int(request.data.get("index"))
        except (TypeError, ValueError):
            return Response({"index": "Kadr raqami kerak"}, status=status.HTTP_400_BAD_REQUEST)
        return self._result(briefs.toggle_shot(self.get_object(), index, request.data.get("done"), by=request.user))
