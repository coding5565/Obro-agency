import csv
import json
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from django.utils.timezone import make_aware
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ParseError, UnsupportedMediaType
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.clients.selectors import visible_projects
from apps.leads import models as lm
from apps.leads import services
from apps.leads.serializers import LeadDetailSerializer, LeadSerializer, LeadSourceSerializer
from common import access
from common.calc.leads import is_ping
from common.csvutil import csv_safe
from common.permissions import ObroPermission

CSV_COLUMNS = [("created_at", "Sana"), ("client", "Mijoz"), ("full_name", "Ism"), ("phone", "Telefon"),
               ("email", "Email"), ("city", "Shahar"), ("form_name", "Forma"), ("campaign_name", "Kampaniya"),
               ("source_label", "Manba"), ("status", "Holat"), ("assigned", "Mas’ul"), ("message", "Izoh")]


def parse_when(raw):
    """Bo'sh qiymat eslatmani olib tashlaydi. Noto'g'ri sana xato qaytaradi."""
    if raw in (None, ""):
        return None
    when = parse_datetime(str(raw))
    if when is None:
        raise serializers.ValidationError({"next_contact_at": "Sana noto‘g‘ri"})
    return make_aware(when) if when.tzinfo is None else when


class LeadHookView(APIView):
    """Tashqi tizim (Yuboraman, Tilda, sayt) lidni shu manzilga yuboradi. Kirish huquqi — manzildagi maxfiy token."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "lead_hook"
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _source(self, token):
        return get_object_or_404(lm.LeadSource.objects.select_related("project__client", "project__tariff_version"),
                                 token=token)

    def get(self, request, token):
        # Ko'p tizim manzilni saqlashdan oldin tekshiradi.
        self._source(token)
        return Response({"ok": True})

    def _payload(self, request):
        raw = request._request.body
        try:
            data = request.data
        except (ParseError, UnsupportedMediaType):
            # Noma'lum format ham yo'qolmasin: JSON bo'lsa o'qiladi, bo'lmasa xom holda saqlanadi.
            text = raw.decode("utf-8", errors="replace").strip()
            try:
                return json.loads(text) if text else {}
            except ValueError:
                return {"_raw": text}
        return data.dict() if hasattr(data, "dict") else data

    def post(self, request, token):
        source = self._source(token)
        if not source.is_active:
            return Response({"ok": False, "detail": "Manba o‘chirilgan"}, status=status.HTTP_410_GONE)
        payload = self._payload(request)
        if is_ping(payload):
            return Response({"ok": True, "ignored": True})
        if isinstance(payload, list):
            rows = [row for row in payload if isinstance(row, dict) and row]
            results = [services.ingest(source, row) for row in rows]
            return Response({"ok": True, "lead_ids": [lead.pk for lead, _ in results]})
        lead, is_new = services.ingest(source, payload if isinstance(payload, dict) else {"_raw": str(payload)})
        return Response({"ok": True, "lead_id": lead.pk, "duplicate": not is_new})


class LeadSourceViewSet(viewsets.ModelViewSet):
    serializer_class = LeadSourceSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.LEADS_MANAGE, "write": access.LEADS_MANAGE}
    filterset_fields = ["project", "kind", "is_active"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return lm.LeadSource.objects.filter(project__in=visible_projects(self.request.user)).select_related(
            "project__client", "project__tariff_version")

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        """Sinov lidi: butun yo'l (qabul qilish, bildirishnoma) ishlashini ko'rsatadi, hisobotga kirmaydi."""
        source = self.get_object()
        lead, _ = services.ingest(source, {"id": f"test-{uuid4().hex[:12]}", "full_name": "Sinov lidi",
                                           "phone": "+998900000000", "form_name": "Sinov", "message": "Ulanish sinovi"})
        services.set_status(lead, lm.SPAM, by=request.user)
        return Response(LeadSerializer(lead).data, status=status.HTTP_201_CREATED)


class LeadViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [ObroPermission]
    required_perms = {"read": access.LEADS_VIEW, "write": access.LEADS_MANAGE}
    filterset_fields = ["project", "status", "assigned_to", "source"]
    search_fields = ["full_name", "phone", "form_name", "campaign_name"]

    def get_queryset(self):
        qs = (lm.Lead.objects.filter(project__in=visible_projects(self.request.user))
              .select_related("project__client", "project__tariff_version", "assigned_to", "source")
              .prefetch_related("events__user"))
        params = self.request.query_params
        if params.get("from"):
            qs = qs.filter(created_at__date__gte=params["from"])
        if params.get("to"):
            qs = qs.filter(created_at__date__lte=params["to"])
        return qs

    def get_serializer_class(self):
        return LeadDetailSerializer if self.action != "list" else LeadSerializer

    def _result(self, lead):
        return Response(LeadDetailSerializer(lead, context={"request": self.request}).data)

    def create(self, request):
        project = get_object_or_404(visible_projects(request.user), pk=request.data.get("project"))
        data = request.data
        lead = services.create_manual(project=project, by=request.user, full_name=data.get("full_name", ""),
                                      phone=data.get("phone", ""), email=data.get("email", ""),
                                      message=data.get("message", ""), form_name=data.get("form_name", ""))
        return Response(LeadDetailSerializer(lead).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], permission_classes=[ObroPermission])
    def stats(self, request):
        # Holat bo'yicha filtr voronkani buzmasligi uchun faqat loyiha va sana hisobga olinadi.
        qs = self.get_queryset()
        project = request.query_params.get("project")
        if project:
            qs = qs.filter(project_id=project)
        return Response(services.stats(qs))

    @action(detail=False, methods=["get"])
    def export(self, request):
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="lidlar.csv"'
        response.write("﻿")  # Excel o'zbekcha harflarni to'g'ri ochishi uchun.
        writer = csv.writer(response)
        writer.writerow([title for _, title in CSV_COLUMNS])
        for lead in self.filter_queryset(self.get_queryset())[:5000]:
            row = {
                "created_at": lead.created_at.strftime("%d.%m.%Y %H:%M"), "client": lead.project.client.name,
                "full_name": lead.full_name, "phone": lead.phone, "email": lead.email, "city": lead.city,
                "form_name": lead.form_name, "campaign_name": lead.campaign_name, "source_label": lead.source_label,
                "status": lead.get_status_display(),
                "assigned": lead.assigned_to.full_name if lead.assigned_to else "", "message": lead.message,
            }
            # Telefon raqami o'z «+» belgisini saqlaydi: u formula emas.
            writer.writerow([row[key] if key == "phone" else csv_safe(row[key]) for key, _ in CSV_COLUMNS])
        return response

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        data = request.data
        return self._result(services.set_status(self.get_object(), data.get("status"), by=request.user,
                                                lost_reason=data.get("lost_reason", ""),
                                                sale_amount=data.get("sale_amount"),
                                                sale_currency=data.get("sale_currency")))

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        user_id = request.data.get("assigned_to")
        assignee = get_object_or_404(get_user_model(), pk=user_id, is_active=True) if user_id else None
        return self._result(services.assign(self.get_object(), assignee, by=request.user))

    @action(detail=True, methods=["post"])
    def comment(self, request, pk=None):
        lead = self.get_object()
        services.comment(lead, request.data.get("text"), by=request.user)
        return self._result(lead)

    @action(detail=True, methods=["post"])
    def schedule(self, request, pk=None):
        when = parse_when(request.data.get("next_contact_at"))
        return self._result(services.schedule(self.get_object(), when, by=request.user))
