from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts import serializers as s
from apps.accounts.models import Invite, Position, User
from apps.clients.models import ClientMembership
from common import access, audit
from common.permissions import ObroPermission


def _set_refresh_cookie(response, refresh):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
    )


def _token_response(user):
    refresh = RefreshToken.for_user(user)
    response = Response({"access": str(refresh.access_token), "user": s.MeSerializer(user).data})
    _set_refresh_cookie(response, refresh)
    return response


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = s.LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request, phone=serializer.validated_data["phone"],
                            password=serializer.validated_data["password"])
        if user is None:
            return Response({"detail": "Telefon yoki parol noto‘g‘ri"}, status=status.HTTP_401_UNAUTHORIZED)
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        return _token_response(user)


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            return Response({"detail": "Sessiya tugagan"}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(raw)
            user = User.objects.get(pk=refresh["user_id"], is_active=True)
            refresh.blacklist()
        except (TokenError, User.DoesNotExist, KeyError):
            response = Response({"detail": "Sessiya tugagan"}, status=status.HTTP_401_UNAUTHORIZED)
            response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)
            return response
        return _token_response(user)


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(s.MeSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = s.ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PositionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Position.objects.all()
    serializer_class = s.PositionSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": "*"}
    pagination_class = None


class UserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                  viewsets.GenericViewSet):
    queryset = User.objects.prefetch_related("positions")
    serializer_class = s.UserSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.USERS_VIEW, "write": access.USERS_MANAGE}
    filterset_fields = ["role", "is_active"]
    search_fields = ["full_name", "phone"]

    def get_queryset(self):
        qs = super().get_queryset()
        # Xodimlar ro'yxatida (biriktirish uchun) faqat faol jamoa ko'rinadi, mijozlar alohida.
        if self.request.query_params.get("staff") == "1":
            qs = qs.filter(role__in=access.STAFF_ROLES, is_active=True)
        return qs

    def _guard_super_admin(self, target, new_role=None):
        """Super admin akkauntini va super admin rolini faqat super admin o'zgartiradi."""
        if self.request.user.role == access.SUPER_ADMIN:
            return
        if target.role == access.SUPER_ADMIN or new_role == access.SUPER_ADMIN:
            raise PermissionDenied("Super admin akkauntini faqat super admin o‘zgartiradi")

    def perform_update(self, serializer):
        self._guard_super_admin(serializer.instance, serializer.validated_data.get("role"))
        before = audit.snapshot(serializer.instance, fields=["role", "positions", "full_name"])
        user = serializer.save()
        audit.log(self.request.user, "user.update", user, before=before,
                  after=audit.snapshot(user, fields=["role", "positions", "full_name"]))

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Xodim ketganda: akkaunt o'chiriladi, barcha sessiyalari bekor qilinadi, tarix qoladi."""
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

        user = self.get_object()
        if user == request.user:
            return Response({"detail": "O‘zingizni o‘chira olmaysiz"}, status=status.HTTP_400_BAD_REQUEST)
        self._guard_super_admin(user)
        with transaction.atomic():
            user.is_active = False
            user.deactivated_at = timezone.now()
            user.save(update_fields=["is_active", "deactivated_at"])
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
            audit.log(request.user, "user.deactivate", user)
        return Response(s.UserSerializer(user).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        user = self.get_object()
        self._guard_super_admin(user)
        user.is_active = True
        user.deactivated_at = None
        user.save(update_fields=["is_active", "deactivated_at"])
        audit.log(request.user, "user.activate", user)
        return Response(s.UserSerializer(user).data)


class InviteViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.DestroyModelMixin,
                    viewsets.GenericViewSet):
    queryset = Invite.objects.select_related("client").order_by("-created_at")
    serializer_class = s.InviteSerializer
    permission_classes = [ObroPermission]
    required_perms = {"read": access.USERS_MANAGE, "write": access.USERS_MANAGE}

    def perform_create(self, serializer):
        invite = serializer.save(created_by=self.request.user)
        audit.log(self.request.user, "invite.create", invite, after={"phone": invite.phone, "role": invite.role})


class AcceptInviteView(APIView):
    """Taklif havolasi: GET — kim uchun ekanini ko'rsatadi, POST — parol qo'yib akkaunt ochadi."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def _invite(self, token):
        invite = get_object_or_404(Invite, token=token)
        if not invite.is_usable:
            return None
        return invite

    def get(self, request, token):
        invite = self._invite(token)
        if invite is None:
            return Response({"detail": "Taklif muddati o‘tgan yoki ishlatilgan"}, status=status.HTTP_410_GONE)
        return Response({"full_name": invite.full_name, "phone": invite.phone,
                         "role_label": invite.get_role_display()})

    @transaction.atomic
    def post(self, request, token):
        invite = self._invite(token)
        if invite is None:
            return Response({"detail": "Taklif muddati o‘tgan yoki ishlatilgan"}, status=status.HTTP_410_GONE)
        serializer = s.AcceptInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.create_user(invite.phone, serializer.validated_data["password"],
                                        full_name=invite.full_name, role=invite.role)
        user.positions.set(invite.positions.all())
        if invite.client_id:
            ClientMembership.objects.create(
                user=user, client=invite.client,
                role=ClientMembership.OWNER if invite.role == access.CLIENT_OWNER else ClientMembership.MEMBER,
            )
        invite.accepted_at = timezone.now()
        invite.accepted_user = user
        invite.save(update_fields=["accepted_at", "accepted_user"])
        return _token_response(user)
