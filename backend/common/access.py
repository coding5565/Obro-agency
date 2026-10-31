"""Rollar va ruxsatlar.

Ruxsat rol bo'yicha beriladi. Alohida foydalanuvchiga qo'shimcha ruxsat berish yoki olib qo'yish
mumkin (UserPermissionOverride). Taqiq har doim ustun turadi.
"""

SUPER_ADMIN = "super_admin"
RAHBAR = "rahbar"
SMM = "smm"
CREATOR = "creator"
FREELANCER = "freelancer"
BRANDFACE = "brandface"
CLIENT_OWNER = "client_owner"
CLIENT_MEMBER = "client_member"

ROLE_CHOICES = [
    (SUPER_ADMIN, "Super admin"),
    (RAHBAR, "Rahbar"),
    (SMM, "SMM menejer"),
    (CREATOR, "Ijodkor"),
    (FREELANCER, "Frilanser"),
    (BRANDFACE, "Brendfeys"),
    (CLIENT_OWNER, "Mijoz (egasi)"),
    (CLIENT_MEMBER, "Mijoz xodimi"),
]

STAFF_ROLES = {SUPER_ADMIN, RAHBAR, SMM, CREATOR, FREELANCER, BRANDFACE}
MANAGEMENT_ROLES = {SUPER_ADMIN, RAHBAR}
CLIENT_ROLES = {CLIENT_OWNER, CLIENT_MEMBER}

# Ruxsat kodlari
USERS_MANAGE = "users.manage"
USERS_VIEW = "users.view"
CATALOG_MANAGE = "catalog.manage"
CATALOG_VIEW = "catalog.view"
CLIENTS_MANAGE = "clients.manage"
CLIENTS_VIEW = "clients.view"
CONTENT_MANAGE = "content.manage"
CONTENT_UPLOAD = "content.upload"
CONTENT_VIEW = "content.view"
TASKS_MANAGE = "tasks.manage"
TASKS_VIEW = "tasks.view"
WORKLOG_CREATE = "worklog.create"
WORKLOG_APPROVE = "worklog.approve"
METRICS_MANAGE = "metrics.manage"
METRICS_VIEW = "metrics.view"
LEADS_VIEW = "leads.view"
LEADS_MANAGE = "leads.manage"
FINANCE_MANAGE = "finance.manage"
FINANCE_VIEW_STATUS = "finance.view_status"
EXPENSES_REQUEST = "expenses.request"
PAYROLL_MANAGE = "payroll.manage"
PAYROLL_VIEW_OWN = "payroll.view_own"
REPORTS_AGENCY = "reports.agency"
AUDIT_VIEW = "audit.view"

ALL_PERMISSIONS = [
    USERS_MANAGE, USERS_VIEW, CATALOG_MANAGE, CATALOG_VIEW, CLIENTS_MANAGE, CLIENTS_VIEW,
    CONTENT_MANAGE, CONTENT_UPLOAD, CONTENT_VIEW, TASKS_MANAGE, TASKS_VIEW, WORKLOG_CREATE,
    WORKLOG_APPROVE, METRICS_MANAGE, METRICS_VIEW, LEADS_VIEW, LEADS_MANAGE, FINANCE_MANAGE, FINANCE_VIEW_STATUS,
    EXPENSES_REQUEST, PAYROLL_MANAGE, PAYROLL_VIEW_OWN, REPORTS_AGENCY, AUDIT_VIEW,
]

_STAFF_BASE = {CATALOG_VIEW, CLIENTS_VIEW, CONTENT_VIEW, CONTENT_UPLOAD, TASKS_VIEW, WORKLOG_CREATE,
               PAYROLL_VIEW_OWN, EXPENSES_REQUEST}

ROLE_PERMISSIONS = {
    SUPER_ADMIN: set(ALL_PERMISSIONS),
    RAHBAR: set(ALL_PERMISSIONS),
    SMM: _STAFF_BASE | {CONTENT_MANAGE, TASKS_MANAGE, WORKLOG_APPROVE, METRICS_MANAGE, METRICS_VIEW,
                        FINANCE_VIEW_STATUS, LEADS_VIEW, LEADS_MANAGE},
    CREATOR: _STAFF_BASE | {METRICS_VIEW},
    FREELANCER: {CONTENT_VIEW, CONTENT_UPLOAD, TASKS_VIEW, WORKLOG_CREATE, PAYROLL_VIEW_OWN},
    BRANDFACE: {PAYROLL_VIEW_OWN},
    # Mijozlar ichki API'ga kirmaydi, ular faqat /portal/ dan foydalanadi.
    CLIENT_OWNER: set(),
    CLIENT_MEMBER: set(),
}

# Loyihalar ko'rinishi: hammasi / faqat biriktirilganlar.
SEES_ALL_PROJECTS = MANAGEMENT_ROLES


def role_permissions(role: str) -> set:
    return set(ROLE_PERMISSIONS.get(role, set()))


def effective_permissions(role: str, overrides) -> set:
    """overrides: [(code, "allow"|"deny"), ...]. Taqiq ustun turadi."""
    perms = role_permissions(role)
    denied = set()
    for code, effect in overrides:
        if effect == "allow":
            perms.add(code)
        elif effect == "deny":
            denied.add(code)
    return perms - denied
