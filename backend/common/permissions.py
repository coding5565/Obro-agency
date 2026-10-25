from rest_framework.permissions import BasePermission

READ_ACTIONS = {"list", "retrieve", "metadata"}


class ObroPermission(BasePermission):
    """Ichki API ruxsati. View'da `required_perms` lug'ati bo'ladi:

        required_perms = {"read": CLIENTS_VIEW, "write": CLIENTS_MANAGE, "issue": FINANCE_MANAGE}

    Avval amal nomi qidiriladi, keyin "read" (list/retrieve) yoki "write" (qolganlari).
    Mijoz foydalanuvchilari ichki API'ga umuman kira olmaydi.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active or user.is_client:
            return False
        perms = getattr(view, "required_perms", None)
        if perms is None:
            return False
        action = getattr(view, "action", None) or request.method.lower()
        code = perms.get(action)
        if code is None:
            code = perms.get("read") if (action in READ_ACTIONS or request.method == "GET") else perms.get("write")
        if code is None:
            return False
        if code == "*":
            return True
        return user.has_obro_perm(code)


class IsClientUser(BasePermission):
    """Mijoz kabineti: faqat mijoz rolidagi va kamida bitta mijozga bog'langan foydalanuvchi."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_client
                    and user.client_memberships.exists())
