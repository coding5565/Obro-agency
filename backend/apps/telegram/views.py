"""Telegram bilan bog'liq API.

1) Panel foydalanuvchisi uchun: /telegram/link/ — ulash havolasini olish, ulanishni uzish.
2) Bot uchun: /bot/... — faqat X-Bot-Secret sarlavhasi bilan. Bot foydalanuvchi nomidan ish qilganda
   chat_id yuboradi; API uni ulangan foydalanuvchiga moslaydi va odatdagi ruxsatlarni tekshiradi.
"""
import hmac

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.content import briefs
from apps.content import models as cm
from apps.content.services import client_decide
from apps.content.shoots import client_confirm, when_text
from apps.finance.rates import RateFetchError, store_cbu_rate
from apps.leads import models as lm
from apps.leads import services as lead_services
from apps.tasks.models import DONE, Task
from apps.tasks.services import set_task_status
from apps.telegram import guest, services
from apps.telegram import status as bot_status
from common import access


class BotSecretPermission(BasePermission):
    def has_permission(self, request, view):
        expected = settings.TELEGRAM_BOT_API_SECRET
        given = request.headers.get("X-Bot-Secret", "")
        return bool(expected) and hmac.compare_digest(given, expected)


class LinkView(APIView):
    """Panel: «Telegram’ni ulash». GET — holat, POST — yangi havola, DELETE — uzish."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({"linked": user.telegram_chat_id is not None, "username": user.telegram_username,
                         "linked_at": user.telegram_linked_at, "bot": settings.TELEGRAM_BOT_USERNAME or None})

    def post(self, request):
        return Response(services.create_link(request.user), status=status.HTTP_201_CREATED)

    def delete(self, request):
        services.unlink(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BotView(APIView):
    authentication_classes = []
    permission_classes = [BotSecretPermission]

    def chat_id(self, request):
        raw = request.data.get("chat_id") if request.method != "GET" else request.query_params.get("chat_id")
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"chat_id": "chat_id kerak"}) from None

    def chat_user(self, request):
        return services.user_by_chat(self.chat_id(request))


def _profile(user):
    return {"full_name": user.full_name, "role": user.role, "role_label": user.get_role_display(),
            "is_client": user.is_client, "is_manager": user.role in access.MANAGEMENT_ROLES,
            "can_leads": user.is_client or user.has_obro_perm(access.LEADS_VIEW)}


class BotLinkView(BotView):
    def post(self, request):
        user = services.confirm_link(request.data.get("token", ""), self.chat_id(request),
                                     request.data.get("username", ""))
        return Response(_profile(user))


class BotUnlinkView(BotView):
    def post(self, request):
        services.unlink(self.chat_user(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class BotMeView(BotView):
    def get(self, request):
        return Response(_profile(self.chat_user(request)))


class BotOutboxView(BotView):
    def get(self, request):
        limit = min(int(request.query_params.get("limit", 50)), 100)
        return Response(services.outbox(limit))


class BotOutboxAckView(BotView):
    def post(self, request):
        ids = [int(i) for i in request.data.get("ids", [])]
        return Response({"marked": services.ack(ids)})


class BotTasksView(BotView):
    def get(self, request):
        user = self.chat_user(request)
        if user.is_client:
            raise PermissionDenied("Vazifalar jamoa uchun")
        return Response(services.my_tasks(user))


class BotTaskDoneView(BotView):
    def post(self, request, pk):
        user = self.chat_user(request)
        if user.is_client:
            raise PermissionDenied("Vazifalar jamoa uchun")
        task = get_object_or_404(Task, pk=pk, assignee=user)
        set_task_status(task, DONE, by=user)
        return Response({"ok": True, "title": task.title})


class BotProjectsView(BotView):
    def get(self, request):
        user = self.chat_user(request)
        if user.is_client:
            raise PermissionDenied("Loyihalar ro‘yxati jamoa uchun")
        return Response(services.my_projects(user))


class BotWorklogView(BotView):
    def post(self, request):
        user = self.chat_user(request)
        if user.is_client:
            raise PermissionDenied("Jurnal jamoa uchun")
        data = request.data
        entry = services.add_worklog(user, project_id=data.get("project"), kind=data.get("kind", "other"),
                                     title=data.get("title", ""), quantity=data.get("quantity", 1))
        return Response({"ok": True, "status": entry.get_status_display()}, status=status.HTTP_201_CREATED)


class BotApprovalView(BotView):
    def get(self, request, pk):
        user = self.chat_user(request)
        item = services.client_item(user, pk)
        return Response({"id": item.id, "title": item.title, "status": item.status,
                         "can_decide": item.status == cm.CLIENT_REVIEW})

    def post(self, request, pk):
        user = self.chat_user(request)
        if not user.is_client:
            raise PermissionDenied("Tasdiqlash mijoz uchun")
        item = services.client_item(user, pk)
        decision = request.data.get("decision")
        if decision not in ("approve", "changes"):
            raise serializers.ValidationError({"decision": "approve yoki changes"})
        client_decide(item, by=user, approve=decision == "approve", comment=request.data.get("comment", ""))
        return Response({"ok": True, "title": item.title, "status": item.status})


class BotDailyJobView(BotView):
    """Bot har kuni ertalab chaqiradi: kursni oladi va rahbarlarga xulosa yuboradi."""

    def post(self, request):
        result = {"rate": None, "digest": 0}
        try:
            rate = store_cbu_rate("USD", timezone.localdate())
            result["rate"] = str(rate.rate_to_uzs)
        except RateFetchError as exc:
            result["rate_error"] = str(exc)
        result["digest"] = len(services.morning_digest())
        return Response(result)


class BotEveningJobView(BotView):
    def post(self, request):
        return Response({"reminders": len(services.evening_reminders())})


class BotLeadStatusView(BotView):
    """«Bog'lanildi» va «Spam» tugmalari."""

    def post(self, request, pk):
        user = self.chat_user(request)
        lead = get_object_or_404(lm.Lead.objects.select_related("project__client", "project__tariff_version"), pk=pk)
        value = request.data.get("status")
        if value not in (lm.CONTACTED, lm.SPAM):
            raise serializers.ValidationError({"status": "contacted yoki spam"})
        lead_services.set_status(lead, value, by=user)
        return Response({"ok": True, "status": lead.get_status_display(), "name": lead_services.lead_text(lead)})


class BotBriefsView(BotView):
    def get(self, request):
        user = self.chat_user(request)
        if user.is_client:
            raise PermissionDenied("TZ jamoa uchun")
        return Response(services.my_briefs(user))


class BotBriefAcceptView(BotView):
    def post(self, request, pk):
        user = self.chat_user(request)
        if user.is_client:
            raise PermissionDenied("TZ jamoa uchun")
        brief = get_object_or_404(cm.Brief, pk=pk, assignee=user)
        briefs.accept(brief, by=user)
        return Response({"ok": True, "title": brief.title})


class BotShootsView(BotView):
    def get(self, request):
        return Response(services.my_shoots(self.chat_user(request)))


class BotShootConfirmView(BotView):
    def post(self, request, pk):
        user = self.chat_user(request)
        if not user.is_client:
            raise PermissionDenied("Tasdiqlash mijoz uchun")
        shoot = get_object_or_404(cm.ShootDay.objects.select_related("project__client"), pk=pk, status="planned",
                                  project__client__memberships__user=user)
        client_confirm(shoot, by=user)
        return Response({"ok": True, "when": when_text(shoot)})


class BotStatusView(BotView):
    def get(self, request):
        return Response({"text": bot_status.status_text(self.chat_user(request))})


class BotLeadsView(BotView):
    def get(self, request):
        return Response({"text": bot_status.leads_text(self.chat_user(request))})


class BotPaymentsView(BotView):
    def get(self, request):
        return Response({"text": bot_status.payments_text(self.chat_user(request))})


class BotLoginLinkView(BotView):
    def post(self, request):
        return Response({"url": services.login_link(self.chat_user(request))})


class BotLinkPhoneView(BotView):
    """Bot faqat foydalanuvchining o'z kontaktini yuboradi (contact.user_id == from_user.id tekshiriladi)."""

    def post(self, request):
        user = guest.link_by_phone(self.chat_id(request), request.data.get("phone", ""),
                                   request.data.get("username", ""))
        return Response(_profile(user))


class BotTariffsView(BotView):
    def get(self, request):
        return Response({"text": guest.tariffs_text(), "contact": guest.CONTACT})


class BotGuestRequestView(BotView):
    def post(self, request):
        data = request.data
        _, created = guest.create_request(chat_id=self.chat_id(request), full_name=data.get("full_name", ""),
                                          business=data.get("business", ""), phone=data.get("phone", ""),
                                          username=data.get("username", ""))
        return Response({"ok": True, "created": created}, status=status.HTTP_201_CREATED if created else 200)
