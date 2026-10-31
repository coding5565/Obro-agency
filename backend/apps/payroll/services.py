"""Foizli maosh: to'lovdan hisoblanma, oylik vedomost, xodim hisobi."""
from collections import defaultdict

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.payroll.models import Accrual, Adjustment, CompensationRule, Payout, PayrollSheet
from common import audit
from common.calc import invoices as invoice_calc
from common.calc.payroll import Assignment, Rule, split_payment
from common.money import D, q, to_uzs


def _rules_for(project):
    qs = CompensationRule.objects.select_related("position").filter(
        Q(project__isnull=True) | Q(project=project)
    )
    return [Rule(position=r.position.code, percent=r.percent, valid_from=r.valid_from,
                 tariff_id=r.tariff_id, project_id=r.project_id) for r in qs]


def accrue_for_allocation(allocation):
    """To'lovning hisob-fakturaga tushgan qismidan biriktirilgan xodimlarga ulush yozadi."""
    payment = allocation.payment
    invoice = allocation.invoice
    project = invoice.project
    day = payment.paid_on
    base = invoice_calc.accrual_base(allocation.amount, invoice.total, invoice.transit_total)
    assignments = [a for a in project.assignments.select_related("position", "user")
                   if a.is_active_on(day) and a.position.is_team_share]
    by_key = {(a.user_id, a.position.code): a for a in assignments}
    lines = split_payment(
        base,
        [Assignment(a.user_id, a.position.code, a.share_percent) for a in assignments],
        _rules_for(project),
        on=day,
        tariff_id=project.tariff_version.tariff_id,
        project_id=project.id,
    )
    created = []
    for line in lines:
        assignment = by_key[(line.user_id, line.position)]
        created.append(Accrual.objects.create(
            user_id=line.user_id, project=project, position=assignment.position, payment=payment,
            allocation=allocation, base_amount=base, percent=line.percent, amount=line.amount,
            currency=payment.currency, rate_to_uzs=payment.rate_to_uzs,
            amount_uzs=to_uzs(line.amount, payment.currency, payment.rate_to_uzs), accrued_on=day,
        ))
    return created


def month_accruals(year, month):
    return Accrual.objects.filter(accrued_on__year=year, accrued_on__month=month).exclude(status=Accrual.CANCELLED)


def sheet_rows(year, month):
    """Vedomost qatorlari: har xodim bo'yicha hisoblandi, tuzatishlar, to'landi, qoldiq (so'mda)."""
    rows = defaultdict(lambda: {"accrued": D(0), "adjustments": D(0), "paid": D(0), "items": 0})
    names = {}
    for acc in month_accruals(year, month).select_related("user"):
        rows[acc.user_id]["accrued"] += acc.amount_uzs
        rows[acc.user_id]["items"] += 1
        names[acc.user_id] = acc.user.full_name
    for adj in Adjustment.objects.filter(year=year, month=month).select_related("user"):
        rows[adj.user_id]["adjustments"] += adj.signed_amount
        names[adj.user_id] = adj.user.full_name
    payouts = Payout.objects.filter(sheet__year=year, sheet__month=month, cancelled_at__isnull=True)
    for payout in payouts.select_related("user"):
        rows[payout.user_id]["paid"] += payout.amount_uzs
        names[payout.user_id] = payout.user.full_name
    result = []
    for user_id, row in rows.items():
        payable = q(row["accrued"] + row["adjustments"])
        result.append({
            "user_id": user_id,
            "full_name": names[user_id],
            "accrued_uzs": q(row["accrued"]),
            "adjustments_uzs": q(row["adjustments"]),
            "payable_uzs": payable,
            "paid_uzs": q(row["paid"]),
            "remaining_uzs": q(payable - row["paid"]),
            "items": row["items"],
        })
    return sorted(result, key=lambda r: r["full_name"])


@transaction.atomic
def get_or_create_sheet(year, month):
    sheet, _ = PayrollSheet.objects.get_or_create(year=year, month=month)
    if sheet.status == PayrollSheet.DRAFT:
        month_accruals(year, month).filter(sheet__isnull=True).update(sheet=sheet)
    return sheet


@transaction.atomic
def approve_sheet(sheet, *, by):
    if sheet.status != PayrollSheet.DRAFT:
        raise ValidationError({"status": "Vedomost allaqachon tasdiqlangan"})
    month_accruals(sheet.year, sheet.month).update(sheet=sheet, status=Accrual.APPROVED)
    sheet.status = PayrollSheet.APPROVED
    sheet.approved_by = by
    sheet.approved_at = timezone.now()
    sheet.save(update_fields=["status", "approved_by", "approved_at"])
    audit.log(by, "payroll.approve", sheet, comment=f"{sheet.month:02d}.{sheet.year}")
    return sheet


@transaction.atomic
def record_payout(sheet, *, by, user, amount_uzs, paid_on, method="card", note="", account=None):
    if sheet.status == PayrollSheet.DRAFT:
        raise ValidationError({"status": "Avval vedomostni tasdiqlang"})
    amount = q(amount_uzs)
    if amount <= 0:
        raise ValidationError({"amount_uzs": "Summa musbat bo‘lishi kerak"})
    if account is not None and account.currency != "UZS":
        raise ValidationError({"account": "Maosh so‘mda: so‘mli hisobni tanlang"})
    current = {row["user_id"]: row for row in sheet_rows(sheet.year, sheet.month)}.get(user.id)
    if current is None or amount > current["remaining_uzs"]:
        left = current["remaining_uzs"] if current else 0
        raise ValidationError({"amount_uzs": f"Qoldiqdan ko‘p to‘lab bo‘lmaydi (qoldiq: {left} so‘m)"})
    payout = Payout.objects.create(sheet=sheet, user=user, amount_uzs=amount, paid_on=paid_on,
                                   method=method, note=note, account=account, created_by=by)
    rows = {row["user_id"]: row for row in sheet_rows(sheet.year, sheet.month)}
    if user.id in rows and rows[user.id]["remaining_uzs"] <= 0:
        sheet.accruals.filter(user=user).update(status=Accrual.PAID)
    if all(row["remaining_uzs"] <= 0 for row in rows.values()):
        sheet.status = PayrollSheet.PAID
        sheet.save(update_fields=["status"])
    audit.log(by, "payroll.payout", payout, after=audit.snapshot(payout))
    return payout


@transaction.atomic
def cancel_payout(payout, *, by, reason):
    """Xato yozilgan maosh to'lovi: o'chirilmaydi, sabab bilan bekor qilinadi va qoldiq qaytadi."""
    if not (reason or "").strip():
        raise ValidationError({"reason": "Bekor qilish sababini yozing"})
    if payout.cancelled_at:
        raise ValidationError({"status": "Bu to‘lov allaqachon bekor qilingan"})
    payout.cancelled_at = timezone.now()
    payout.cancel_reason = reason.strip()[:255]
    payout.save(update_fields=["cancelled_at", "cancel_reason"])
    sheet = payout.sheet
    sheet.accruals.filter(user=payout.user, status=Accrual.PAID).update(status=Accrual.APPROVED)
    if sheet.status == PayrollSheet.PAID:
        sheet.status = PayrollSheet.APPROVED
        sheet.save(update_fields=["status"])
    audit.log(by, "payroll.payout_cancel", payout, comment=payout.cancel_reason)
    return payout


def my_summary(user, year, month):
    accruals = month_accruals(year, month).filter(user=user).select_related("project__client", "position")
    total = accruals.aggregate(s=Sum("amount_uzs"))["s"] or 0
    return {"accruals": accruals, "total_uzs": q(total)}
