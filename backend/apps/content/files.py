from django.http import FileResponse, Http404
from django.views import View

from apps.accounts.models import User
from apps.clients.selectors import visible_projects
from apps.content.models import ContentVersion
from common.files import read_token


class VersionFileView(View):
    """Imzolangan havola orqali versiya faylini beradi. Kirish huquqi har safar qayta tekshiriladi."""

    def get(self, request, token):
        data = read_token(token)
        if not data:
            raise Http404("Havola eskirgan")
        version = ContentVersion.objects.select_related("item__project").filter(pk=data["v"]).first()
        user = User.objects.filter(pk=data["u"], is_active=True).first()
        if version is None or user is None or not version.file:
            raise Http404()
        if user.is_client:
            allowed = version.client_visible and user.client_memberships.filter(
                client_id=version.item.project.client_id).exists()
        else:
            allowed = visible_projects(user).filter(pk=version.item.project_id).exists()
        if not allowed:
            raise Http404()
        response = FileResponse(version.file.open("rb"))
        response["Cache-Control"] = "private, max-age=600"
        return response
