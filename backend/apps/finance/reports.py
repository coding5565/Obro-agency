"""Moliyaviy hisobotlar (so'mda). Sof foyda hisoblangan usulda, pul oqimi esa haqiqiy kirim-chiqim bo'yicha."""
from collections import Counter, defaultdict

from django.db.models import Sum

from apps.finance.models import Expense, Invoice, MonthClose, Partner, PartnerWithdrawal, Payment
from apps.payroll.models import Accrual, Adjustment, Payout
from apps.payroll.services import sheet_rows
from common.dates import month_range
from common.money import D, q

GENERAL = "Umumiy (mijozga bog‘lanmagan)"


def _payments(start, end):
    return Payment.objects.filter(paid_on__range=(start, end), cancelled_at__isnull=True)


def _expenses(start, end):
    return Expense.objects.filter(spent_on__range=(start, end), status=Expense.APPROVED, cancelled_at__isnull=True)


def _accruals(start, end):
    return Accrual.objects.filter(accrued_on__range=(start, end)).exclude(status=Accrual.CANCELLED)


def _adjustments(year, month):
    """Avans xarajat emas: u maoshdan oldindan berilgan pul. Bonus, dona ish va jarima foydaga ta'sir qiladi."""
    return Adjustment.objects.filter(year=year, month=month).exclude(kind="advance")


def _transit(payment):
    """To'lovning reklama budjetiga tegishli qismi (so'mda). Bu agentlik daromadi emas."""
    total = D(0)
    for alloc in payment.allocations.all():
        inv = alloc.invoice
        if inv.transit_total and inv.total:
            total += alloc.amount * inv.transit_total / inv.total * payment.rate_to_uzs
    return total


def _sum(qs, field="amount_uzs"):
    return D(qs.aggregate(s=Sum(field))["s"] or 0)


def _margin(profit, income):
    return round(profit * 100 / income, 1) if income > 0 else None


def month_totals(year, month):
    start, end = month_range(year, month)
    payments = _payments(start, end).prefetch_related("allocations__invoice")
    income = sum((D(p.amount_uzs) for p in payments), D(0))
    transit = sum((_transit(p) for p in payments), D(0))
    accruals = _sum(_accruals(start, end))
    adjustments = sum((a.signed_amount for a in _adjustments(year, month)), D(0))
    expenses = _sum(_expenses(start, end))
    own_income = income - transit
    return {
        "income": income, "transit": transit, "own_income": own_income, "accruals": accruals,
        "adjustments": adjustments, "team": accruals + adjustments, "expenses": expenses,
        "profit": own_income - accruals - adjustments - expenses,
    }


def month_summary(year, month):
    start, end = month_range(year, month)
    totals = month_totals(year, month)
    expenses = _expenses(start, end)
    by_category = [{"category": row["category__name"], "amount_uzs": str(q(row["s"]))}
                   for row in expenses.values("category__name").annotate(s=Sum("amount_uzs")).order_by("-s")]
    withdrawals = PartnerWithdrawal.objects.filter(taken_on__range=(start, end), cancelled_at__isnull=True)
    taken = {row["partner"]: row["s"] for row in withdrawals.values("partner").annotate(s=Sum("amount_uzs"))}
    distributable = max(totals["profit"], D(0))
    partners = [{"id": p.id, "name": p.name, "share_percent": str(p.share_percent),
                 "share_uzs": str(q(distributable * p.share_percent / 100)),
                 "taken_uzs": str(q(taken.get(p.id, 0)))}
                for p in Partner.objects.filter(is_active=True)]
    payouts = _sum(Payout.objects.filter(paid_on__range=(start, end), cancelled_at__isnull=True))
    advances = _sum(Adjustment.objects.filter(year=year, month=month, kind="advance"))
    withdrawn = _sum(withdrawals)
    cash_out = payouts + advances + totals["expenses"] + withdrawn
    receivable = Counter()
    for invoice in Invoice.objects.filter(issued_at__isnull=False, cancelled_at__isnull=True):
        if invoice.outstanding > 0:
            receivable[invoice.currency] += invoice.outstanding
    return {
        "month": f"{year}-{month:02d}",
        "income_uzs": str(q(totals["income"])),
        "transit_uzs": str(q(totals["transit"])),
        "own_income_uzs": str(q(totals["own_income"])),
        "team_share_uzs": str(q(totals["team"])),
        "team_accruals_uzs": str(q(totals["accruals"])),
        "team_adjustments_uzs": str(q(totals["adjustments"])),
        "expenses_uzs": str(q(totals["expenses"])),
        "expenses_by_category": by_category,
        "profit_uzs": str(q(totals["profit"])),
        "margin_percent": _margin(totals["profit"], totals["own_income"]),
        "partners": partners,
        "cash": {"in_uzs": str(q(totals["income"])), "payouts_uzs": str(q(payouts)), "advances_uzs": str(q(advances)),
                 "expenses_uzs": str(q(totals["expenses"])), "withdrawals_uzs": str(q(withdrawn)),
                 "net_uzs": str(q(totals["income"] - cash_out))},
        "payroll_unpaid_uzs": str(q(sum((row["remaining_uzs"] for row in sheet_rows(year, month)), D(0)))),
        "receivable": {cur: str(q(val)) for cur, val in receivable.items()},
        "is_closed": MonthClose.objects.filter(year=year, month=month).exists(),
    }


def trend(year, month, months=12):
    """Oxirgi 12 oy: tushum, xarajat va foyda."""
    rows = []
    for back in range(months - 1, -1, -1):
        index = year * 12 + (month - 1) - back
        y, m = index // 12, index % 12 + 1
        totals = month_totals(y, m)
        rows.append({"month": f"{y}-{m:02d}", "income_uzs": str(q(totals["own_income"])),
                     "team_uzs": str(q(totals["team"])), "expenses_uzs": str(q(totals["expenses"])),
                     "profit_uzs": str(q(totals["profit"]))})
    return rows


def by_client(year, month):
    """Har mijoz qancha foyda keltirdi. Qatorlar yig'indisi oylik sof foydaga teng bo'ladi."""
    start, end = month_range(year, month)
    rows = defaultdict(lambda: {"income": D(0), "team": D(0), "expenses": D(0)})
    for p in _payments(start, end).select_related("client").prefetch_related("allocations__invoice"):
        rows[p.client.name]["income"] += D(p.amount_uzs) - _transit(p)
    for acc in _accruals(start, end).select_related("project__client"):
        rows[acc.project.client.name]["team"] += D(acc.amount_uzs)
    for adj in _adjustments(year, month).select_related("project__client"):
        name = adj.project.client.name if adj.project_id else GENERAL
        rows[name]["team"] += adj.signed_amount
    for exp in _expenses(start, end).select_related("project__client"):
        name = exp.project.client.name if exp.project_id else GENERAL
        rows[name]["expenses"] += D(exp.amount_uzs)
    result = []
    for name, row in rows.items():
        profit = row["income"] - row["team"] - row["expenses"]
        result.append({"client": name, "income_uzs": str(q(row["income"])), "team_uzs": str(q(row["team"])),
                       "expenses_uzs": str(q(row["expenses"])), "profit_uzs": str(q(profit)),
                       "margin_percent": _margin(profit, row["income"])})
    return sorted(result, key=lambda r: -D(r["profit_uzs"]))


def export_rows(kind, year, month):
    """CSV uchun: (ustunlar, qatorlar). Foydalanuvchi matni common.csvutil orqali tozalanadi."""
    start, end = month_range(year, month)
    if kind == "payments":
        qs = Payment.objects.filter(paid_on__range=(start, end)).select_related("client", "account")
        return (["Sana", "Mijoz", "Summa", "Valyuta", "Kurs", "So‘mda", "Usul", "Hisob", "Izoh", "Bekor sababi"],
                [[f"{p.paid_on:%d.%m.%Y}", p.client.name, p.amount, p.currency, p.rate_to_uzs, p.amount_uzs,
                  p.get_method_display(), p.account.name if p.account else "", p.note, p.cancel_reason] for p in qs])
    if kind == "expenses":
        qs = (Expense.objects.filter(spent_on__range=(start, end))
              .select_related("category", "project__client", "account"))
        return (["Sana", "Kategoriya", "Tavsif", "Summa", "Valyuta", "So‘mda", "Mijoz", "Hisob", "Holat",
                 "Bekor sababi"],
                [[f"{e.spent_on:%d.%m.%Y}", e.category.name, e.description, e.amount, e.currency, e.amount_uzs,
                  e.project.client.name if e.project_id else "", e.account.name if e.account else "",
                  e.get_status_display(), e.cancel_reason] for e in qs])
    if kind == "payroll":
        return (["Xodim", "Hisoblandi", "Tuzatishlar", "To‘lanadi", "To‘landi", "Qoldiq"],
                [[r["full_name"], r["accrued_uzs"], r["adjustments_uzs"], r["payable_uzs"], r["paid_uzs"],
                  r["remaining_uzs"]] for r in sheet_rows(year, month)])
    if kind == "clients":
        return (["Mijoz", "Tushum", "Jamoa ulushi", "Xarajat", "Foyda", "Marja %"],
                [[r["client"], r["income_uzs"], r["team_uzs"], r["expenses_uzs"], r["profit_uzs"],
                  r["margin_percent"] if r["margin_percent"] is not None else ""] for r in by_client(year, month)])
    return None
