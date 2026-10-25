from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.catalog.models import PANEL_FEATURES, Service, Tariff, TariffVersion
from apps.catalog.serializers import ServiceSerializer, TariffSerializer, TariffVersionSerializer
from common import access, audit
from common.permissions import ObroPermission


class TariffViewSet(viewsets.ModelViewSet):
    queryset = Tariff.objects.prefetch_related("versions__limits")
    serializer_class = TariffSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CATALOG_VIEW, "write": access.CATALOG_MANAGE, "features": "*"}
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    @action(detail=False, methods=["get"])
    def features(self, request):
        return Response([{"code": code, "label": label} for code, label in PANEL_FEATURES.items()])


class TariffVersionViewSet(viewsets.ModelViewSet):
    queryset = TariffVersion.objects.select_related("tariff").prefetch_related("limits")
    serializer_class = TariffVersionSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CATALOG_VIEW, "write": access.CATALOG_MANAGE}
    filterset_fields = ["tariff"]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        version = serializer.save()
        audit.log(self.request.user, "tariff_version.create", version, after=audit.snapshot(version))

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        version = serializer.save()
        audit.log(self.request.user, "tariff_version.update", version, before=before, after=audit.snapshot(version))


class ServiceViewSet(viewsets.ModelViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CATALOG_VIEW, "write": access.CATALOG_MANAGE}
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]
