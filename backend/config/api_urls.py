from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts import views as accounts
from apps.catalog import views as catalog
from apps.clients import views as clients
from apps.content import views as content
from apps.content.files import VersionFileView
from apps.core import views as core
from apps.finance import views as finance
from apps.metrics import views as metrics
from apps.notifications import views as notifications
from apps.payroll import views as payroll
from apps.portal import views as portal
from apps.tasks import views as tasks
from apps.telegram import views as telegram
from apps.worklog import views as worklog

router = DefaultRouter()
router.register("users", accounts.UserViewSet, basename="user")
router.register("positions", accounts.PositionViewSet, basename="position")
router.register("invites", accounts.InviteViewSet, basename="invite")
router.register("catalog/tariffs", catalog.TariffViewSet, basename="tariff")
router.register("catalog/tariff-versions", catalog.TariffVersionViewSet, basename="tariff-version")
router.register("catalog/services", catalog.ServiceViewSet, basename="service")
router.register("clients", clients.ClientViewSet, basename="client")
router.register("client-contacts", clients.ClientContactViewSet, basename="client-contact")
router.register("social-accounts", clients.SocialAccountViewSet, basename="social-account")
router.register("client-members", clients.MembershipViewSet, basename="client-member")
router.register("projects", clients.ProjectViewSet, basename="project")
router.register("assignments", clients.AssignmentViewSet, basename="assignment")
router.register("content/items", content.ContentItemViewSet, basename="content-item")
router.register("content/shoot-days", content.ShootDayViewSet, basename="shoot-day")
router.register("tasks", tasks.TaskViewSet, basename="task")
router.register("worklog", worklog.WorkLogViewSet, basename="worklog")
router.register("metrics/snapshots", metrics.MetricSnapshotViewSet, basename="metric-snapshot")
router.register("metrics/content", metrics.ContentMetricViewSet, basename="content-metric")
router.register("ads/campaigns", metrics.AdCampaignViewSet, basename="ad-campaign")
router.register("ads/stats", metrics.AdStatViewSet, basename="ad-stat")
router.register("finance/rates", finance.ExchangeRateViewSet, basename="rate")
router.register("finance/accounts", finance.CashAccountViewSet, basename="cash-account")
router.register("finance/invoices", finance.InvoiceViewSet, basename="invoice")
router.register("finance/payments", finance.PaymentViewSet, basename="payment")
router.register("finance/expense-categories", finance.ExpenseCategoryViewSet, basename="expense-category")
router.register("finance/expenses", finance.ExpenseViewSet, basename="expense")
router.register("payroll/rules", payroll.CompensationRuleViewSet, basename="payroll-rule")
router.register("payroll/accruals", payroll.AccrualViewSet, basename="accrual")
router.register("payroll/adjustments", payroll.AdjustmentViewSet, basename="adjustment")
router.register("notifications", notifications.NotificationViewSet, basename="notification")
router.register("audit", core.AuditLogViewSet, basename="audit")

auth_urls = [
    path("login/", accounts.LoginView.as_view(), name="login"),
    path("refresh/", accounts.RefreshView.as_view(), name="refresh"),
    path("logout/", accounts.LogoutView.as_view(), name="logout"),
    path("me/", accounts.MeView.as_view(), name="me"),
    path("password/", accounts.ChangePasswordView.as_view(), name="change-password"),
    path("invite/<str:token>/", accounts.AcceptInviteView.as_view(), name="accept-invite"),
]

portal_urls = [
    path("dashboard/", portal.DashboardView.as_view(), name="portal-dashboard"),
    path("calendar/", portal.CalendarView.as_view(), name="portal-calendar"),
    path("approvals/", portal.ApprovalListView.as_view(), name="portal-approvals"),
    path("approvals/<int:pk>/", portal.ApprovalDetailView.as_view(), name="portal-approval"),
    path("worklog/", portal.WorklogView.as_view(), name="portal-worklog"),
    path("metrics/", portal.MetricsView.as_view(), name="portal-metrics"),
    path("ads/", portal.AdsView.as_view(), name="portal-ads"),
    path("invoices/", portal.InvoicesView.as_view(), name="portal-invoices"),
    path("requests/", portal.RequestView.as_view(), name="portal-requests"),
]

bot_urls = [
    path("link/", telegram.BotLinkView.as_view()),
    path("unlink/", telegram.BotUnlinkView.as_view()),
    path("me/", telegram.BotMeView.as_view()),
    path("outbox/", telegram.BotOutboxView.as_view()),
    path("outbox/ack/", telegram.BotOutboxAckView.as_view()),
    path("tasks/", telegram.BotTasksView.as_view()),
    path("tasks/<int:pk>/done/", telegram.BotTaskDoneView.as_view()),
    path("projects/", telegram.BotProjectsView.as_view()),
    path("worklog/", telegram.BotWorklogView.as_view()),
    path("approvals/<int:pk>/", telegram.BotApprovalView.as_view()),
    path("jobs/daily/", telegram.BotDailyJobView.as_view()),
    path("jobs/evening/", telegram.BotEveningJobView.as_view()),
]

urlpatterns = [
    path("auth/", include(auth_urls)),
    path("portal/", include(portal_urls)),
    path("bot/", include(bot_urls)),
    path("telegram/link/", telegram.LinkView.as_view(), name="telegram-link"),
    path("dashboard/", core.DashboardView.as_view(), name="dashboard"),
    path("finance/debts/", finance.DebtsView.as_view(), name="debts"),
    path("finance/summary/", finance.MonthSummaryView.as_view(), name="finance-summary"),
    path("finance/close-month/", finance.CloseMonthView.as_view(), name="close-month"),
    path("payroll/sheet/", payroll.PayrollSheetView.as_view(), name="payroll-sheet"),
    path("payroll/me/", payroll.MyPayrollView.as_view(), name="payroll-me"),
    path("files/v/<str:token>/", VersionFileView.as_view(), name="version-file"),
    path("", include(router.urls)),
]
