"""Hisob-faktura, to'lov va xarajat amallari. Har amal audit jurnaliga yoziladi."""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.finance.models import Expense, Invoice, InvoiceLine, MonthClose, Payment, PaymentAllocation
from apps.finance.rates import rate_for_day
from apps.notifications.services import notify, project_client_users
from common import access, audit
from common.calc import invoices as calc
from common.money import UZS, D, q, to_uzs


def resolve_rate(currency, day, given=None):
    """Kurs berilmagan bo'lsa, shu kundagi (yoki undan oldingi eng yaqin) kurs olinadi."""
    if currency == UZS:
        return D(1)
    if given not in (None, ""):
        rate = D(given)
    else:
        rate = rate_for_day(currency, day)
    if not rate or rate <= 0:
        raise ValidationError({"rate_to_uzs": f"{day:%d.%m.%Y} uchun {currency} kursi yo‘q. Kursni kiriting."})
    return rate


def _require_account_currency(account, currency):
    if account is not None and account.currency != currency:
        raise ValidationError({"account": f"«{account.name}» hisobi {account.currency} da, summa esa {currency} da"})


def ensure_month_open(day, user):
    if MonthClose.is_closed(day) and user.role not in access.MANAGEMENT_ROLES:
        raise ValidationError({"date": "Bu oy yopilgan. O‘zgartirishni faqat rahbar qila oladi."})


def _next_invoice_number(period_start):
    prefix = f"OB-{period_start:%Y%m}-"
    last = (Invoice.objects.filter(number__startswith=prefix).order_by("-number")
            .values_list("number", flat=True).first())
    seq = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{seq:03d}"


@transaction.atomic
def create_invoice_for_period(project, period_index, *, by=None):
    """Loyiha davri uchun hisob-faktura qoralamasi (tarif qatori bilan). Bor bo'lsa, o'shani qaytaradi."""
    begin, end = calc.billing_period(project.start_date, period_index)
    existing = Invoice.objects.filter(project=project, period_start=begin).first()
    if existing:
        return existing, False
    invoice = Invoice.objects.create(
        project=project,
        number=_next_invoice_number(begin),
        period_start=begin,
        period_end=end,
        currency=project.currency,
        due_date=begin + timedelta(days=settings.INVOICE_DUE_DAYS),
    )
    tariff_name = project.tariff_version.tariff.name
    description = f"{tariff_name} tarifi · {begin:%d.%m.%Y}–{end:%d.%m.%Y}"
    if D(project.discount_percent):
        description += f" · chegirma {project.discount_percent}%"
    InvoiceLine.objects.create(invoice=invoice, kind=InvoiceLine.TARIFF, description=description,
                               quantity=1, unit_price=project.monthly_amount)
    invoice.recalc_totals()
    audit.log(by, "invoice.create", invoice, after=audit.snapshot(invoice))
    return invoice, True


def generate_due_invoices(today=None, *, by=None):
    """Bugun boshlanadigan (yoki o'tib ketgan, lekin yaratilmagan) davrlar uchun qoralamalar."""
    from apps.clients.models import Project

    today = today or timezone.localdate()
    created = []
    projects = Project.objects.filter(status="active", start_date__lte=today).select_related("tariff_version__tariff")
    for project in projects:
        index = calc.period_index_for(project.start_date, today)
        if project.end_date and calc.billing_period(project.start_date, index)[0] > project.end_date:
            continue
        invoice, is_new = create_invoice_for_period(project, index, by=by)
        if is_new:
            created.append(invoice)
    return created


@transaction.atomic
def issue_invoice(invoice, *, by):
    if invoice.cancelled_at or invoice.issued_at:
        raise ValidationError({"status": "Hisob-faktura allaqachon chiqarilgan yoki bekor qilingan"})
    if D(invoice.total) <= 0:
        raise ValidationError({"total": "Bo‘sh hisob-fakturani chiqarib bo‘lmaydi"})
    invoice.issued_at = timezone.now()
    invoice.save(update_fields=["issued_at"])
    audit.log(by, "invoice.issue", invoice)
    notify(project_client_users(invoice.project), "invoice.issued",
           f"Hisob-faktura {invoice.number}: {invoice.total} {invoice.currency}",
           body=f"To‘lov muddati: {invoice.due_date:%d.%m.%Y}", link="/portal/invoices")
    return invoice


@transaction.atomic
def cancel_invoice(invoice, *, by, reason):
    if not reason.strip():
        raise ValidationError({"reason": "Bekor qilish sababini yozing"})
    if invoice.paid_amount > 0:
        raise ValidationError(
            {"status": "To‘lov tushgan hisob-fakturani bekor qilib bo‘lmaydi. Avval to‘lovni bekor qiling."})
    before = audit.snapshot(invoice)
    invoice.cancelled_at = timezone.now()
    invoice.cancel_reason = reason
    invoice.save(update_fields=["cancelled_at", "cancel_reason"])
    audit.log(by, "invoice.cancel", invoice, before=before, after=audit.snapshot(invoice), comment=reason)
    return invoice


def _open_invoices(client, project, currency):
    qs = (Invoice.objects.filter(project__client=client, currency=currency, issued_at__isnull=False,
                                 cancelled_at__isnull=True).order_by("period_start", "id"))
    if project is not None:
        qs = qs.filter(project=project)
    return [inv for inv in qs if inv.outstanding > 0]


@transaction.atomic
def record_payment(*, client, amount, currency, paid_on, by, project=None, invoice=None, rate_to_uzs=None,
                   method="cash", account=None, note=""):
    """To'lovni qayd etadi, hisob-fakturalarga taqsimlaydi va maosh hisoblanmalarini yaratadi."""
    from apps.payroll.services import accrue_for_allocation

    amount = q(amount)
    if amount <= 0:
        raise ValidationError({"amount": "Summa musbat bo‘lishi kerak"})
    ensure_month_open(paid_on, by)
    _require_account_currency(account, currency)
    if invoice is not None:
        if invoice.project.client_id != client.id:
            raise ValidationError({"invoice": "Hisob-faktura boshqa mijozga tegishli"})
        if invoice.currency != currency:
            raise ValidationError({"currency": "To‘lov valyutasi hisob-faktura valyutasi bilan bir xil bo‘lishi kerak"})
        project = invoice.project
    rate = resolve_rate(currency, paid_on, rate_to_uzs)
    payment = Payment.objects.create(
        client=client, project=project, amount=amount, currency=currency, rate_to_uzs=rate,
        amount_uzs=to_uzs(amount, currency, rate), method=method, account=account, paid_on=paid_on,
        note=note, received_by=by,
    )
    if invoice is not None:
        targets = [(invoice.id, invoice.outstanding)]
    else:
        targets = [(inv.id, inv.outstanding) for inv in _open_invoices(client, project, currency)]
    allocations, _advance = calc.allocate_fifo(amount, targets)
    for invoice_id, part in allocations:
        allocation = PaymentAllocation.objects.create(payment=payment, invoice_id=invoice_id, amount=part)
        accrue_for_allocation(allocation)
    audit.log(by, "payment.create", payment, after=audit.snapshot(payment))
    return payment


@transaction.atomic
def allocate_advance(payment, *, by):
    """Avans (taqsimlanmagan qism)ni keyin chiqarilgan hisob-fakturalarga yopadi."""
    from apps.payroll.services import accrue_for_allocation

    if payment.cancelled_at:
        raise ValidationError({"status": "Bekor qilingan to‘lov"})
    left = payment.unallocated_amount
    if left <= 0:
        return []
    targets = [(inv.id, inv.outstanding) for inv in _open_invoices(payment.client, payment.project, payment.currency)]
    allocations, _ = calc.allocate_fifo(left, targets)
    created = []
    for invoice_id, part in allocations:
        allocation = PaymentAllocation.objects.create(payment=payment, invoice_id=invoice_id, amount=part)
        accrue_for_allocation(allocation)
        created.append(allocation)
    audit.log(by, "payment.allocate_advance", payment, comment=f"{len(created)} ta hisob-faktura")
    return created


@transaction.atomic
def cancel_payment(payment, *, by, reason):
    from apps.payroll.models import Accrual

    if not reason.strip():
        raise ValidationError({"reason": "Bekor qilish sababini yozing"})
    if payment.cancelled_at:
        raise ValidationError({"status": "To‘lov allaqachon bekor qilingan"})
    ensure_month_open(payment.paid_on, by)
    if payment.accruals.filter(status=Accrual.PAID).exists():
        raise ValidationError(
            {"status": "Bu to‘lovdan xodimlarga maosh to‘lab bo‘lingan. Avval maoshga tuzatish kiriting."})
    before = audit.snapshot(payment)
    payment.cancelled_at = timezone.now()
    payment.cancelled_by = by
    payment.cancel_reason = reason
    payment.save(update_fields=["cancelled_at", "cancelled_by", "cancel_reason"])
    payment.accruals.exclude(status=Accrual.CANCELLED).update(status=Accrual.CANCELLED)
    audit.log(by, "payment.cancel", payment, before=before, after=audit.snapshot(payment), comment=reason)
    return payment


@transaction.atomic
def create_expense(*, by, amount, currency, spent_on, rate_to_uzs=None, **fields):
    ensure_month_open(spent_on, by)
    _require_account_currency(fields.get("account"), currency)
    rate = resolve_rate(currency, spent_on, rate_to_uzs)
    status = Expense.APPROVED if by.has_obro_perm(access.FINANCE_MANAGE) else Expense.REQUESTED
    expense = Expense.objects.create(
        amount=q(amount), currency=currency, rate_to_uzs=rate, amount_uzs=to_uzs(amount, currency, rate),
        spent_on=spent_on, status=status, created_by=by, **fields,
    )
    audit.log(by, "expense.create", expense, after=audit.snapshot(expense))
    return expense


@transaction.atomic
def review_expense(expense, *, by, approve: bool):
    if expense.status != Expense.REQUESTED or expense.cancelled_at:
        raise ValidationError({"status": "Bu so‘rov allaqachon ko‘rib chiqilgan"})
    expense.status = Expense.APPROVED if approve else Expense.REJECTED
    expense.save(update_fields=["status"])
    audit.log(by, "expense.review", expense, comment=expense.status)
    return expense


@transaction.atomic
def cancel_expense(expense, *, by, reason):
    if not reason.strip():
        raise ValidationError({"reason": "Bekor qilish sababini yozing"})
    if expense.cancelled_at:
        raise ValidationError({"status": "Xarajat allaqachon bekor qilingan"})
    ensure_month_open(expense.spent_on, by)
    before = audit.snapshot(expense)
    expense.cancelled_at = timezone.now()
    expense.cancel_reason = reason
    expense.save(update_fields=["cancelled_at", "cancel_reason"])
    audit.log(by, "expense.cancel", expense, before=before, comment=reason)
    return expense


def remind_invoice(invoice, *, by):
    """Mijozga to'lov eslatmasi. Bir hisob-faktura uchun kuniga bir marta."""
    if not invoice.issued_at or invoice.cancelled_at or invoice.outstanding <= 0:
        raise ValidationError({"status": "Bu hisob-faktura bo‘yicha qarz yo‘q"})
    project = invoice.project
    payers = [m.user for m in project.client.memberships.select_related("user") if m.can_see_payments]
    rows = notify(payers, "invoice.reminder", f"To‘lov eslatmasi: {invoice.number}",
                  body=f"Qoldiq: {invoice.outstanding} {invoice.currency}, muddat {invoice.due_date:%d.%m.%Y}",
                  link="/portal/invoices", dedupe_key=f"invremind:{invoice.pk}:{timezone.localdate():%Y%m%d}")
    audit.log(by, "invoice.remind", invoice, comment=f"{len(rows)} ta qabul qiluvchi")
    return rows
