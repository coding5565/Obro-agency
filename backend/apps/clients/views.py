from django.db.models import Prefetch
from rest_framework import viewsets

from apps.clients import serializers as s
from apps.clients.models import ClientContact, ClientMembership, Project, ProjectAssignment, SocialAccount
from apps.clients.selectors import visible_clients, visible_projects
from common import access, audit
from common.permissions import ObroPermission


class ClientViewSet(viewsets.ModelViewSet):
    serializer_class = s.ClientSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CLIENTS_VIEW, "write": access.CLIENTS_MANAGE}
    filterset_fields = ["status", "niche"]
    search_fields = ["name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        projects = Project.objects.select_related("tariff_version__tariff")
        return visible_clients(self.request.user).prefetch_related(
            "contacts", "social_accounts", Prefetch("projects", queryset=projects))

    def perform_create(self, serializer):
        client = serializer.save()
        audit.log(self.request.user, "client.create", client, after=audit.snapshot(client))


class ClientContactViewSet(viewsets.ModelViewSet):
    serializer_class = s.ClientContactSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CLIENTS_VIEW, "write": access.CLIENTS_MANAGE}
    filterset_fields = ["client"]

    def get_queryset(self):
        return ClientContact.objects.filter(client__in=visible_clients(self.request.user))


class SocialAccountViewSet(viewsets.ModelViewSet):
    serializer_class = s.SocialAccountSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CLIENTS_VIEW, "write": access.METRICS_MANAGE}
    filterset_fields = ["client", "platform"]
    pagination_class = None

    def get_queryset(self):
        return SocialAccount.objects.filter(client__in=visible_clients(self.request.user))


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = s.ProjectSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CLIENTS_VIEW, "write": access.CLIENTS_MANAGE}
    filterset_fields = ["client", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return visible_projects(self.request.user).prefetch_related(
            "tariff_version__limits", "assignments__user", "assignments__position")

    def perform_create(self, serializer):
        project = serializer.save()
        audit.log(self.request.user, "project.create", project, after=audit.snapshot(project))

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        project = serializer.save()
        audit.log(self.request.user, "project.update", project, before=before, after=audit.snapshot(project))


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = s.AssignmentSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CLIENTS_VIEW, "write": access.CLIENTS_MANAGE}
    filterset_fields = ["project", "user"]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return ProjectAssignment.objects.select_related("user", "position").filter(
            project__in=visible_projects(self.request.user))

    def perform_create(self, serializer):
        assignment = serializer.save()
        audit.log(self.request.user, "assignment.create", assignment, after=audit.snapshot(assignment))

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        assignment = serializer.save()
        audit.log(self.request.user, "assignment.update", assignment, before=before,
                  after=audit.snapshot(assignment))


class MembershipViewSet(viewsets.ModelViewSet):
    """Mijoz kabinetiga kiradiganlar (akkaunt taklif orqali ochiladi)."""

    serializer_class = s.MembershipSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.CLIENTS_MANAGE, "write": access.USERS_MANAGE}
    filterset_fields = ["client"]
    pagination_class = None
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return ClientMembership.objects.select_related("user", "client")
