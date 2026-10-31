"""Kassa va hisoblar: qoldiq, ko'chirma, o'tkazma, sheriklar puli va takroriy xarajatlar.

Qoldiq saqlanmaydi, har safar yozuvlardan hisoblanadi: shunda bekor qilingan yozuv qoldiqni o'zi to'g'rilaydi.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.finance.models import AccountTransfer, Expense, MonthClose, PartnerWithdrawal, Payment
from apps.finance.services import ensure_month_open, resolve_rate
from apps.notifications.services import notify
from apps.payroll.models import Adjustment, Payout
from common import access, audit
from common.money import D, q, to_uzs


def require_currency(account, currency):
    if account is not None and account.currency != currency:
        raise ValidationError({"account": f"«{account.name}» hisobi {account.currency} da, summa esa {currency} da"})


def account_rows(account):
    """Hisobdagi barcha harakatlar: (sana, tur, izoh, summa). Kirim musbat, chiqim manfiy."""
    rows = []
    for p in Payment.objects.filter(account=account, cancelled_at__isnull=True).select_related("client"):
        rows.append((p.paid_on, "payment", f"To‘lov: {p.client.name}", D(p.amount)))
    expenses = Expense.objects.filter(account=account, status=Expense.APPROVED, cancelled_at__isnull=True)
    for e in expenses.select_related("category"):
        rows.append((e.spent_on, "expense", f"{e.category.name}: {e.description}", -D(e.amount)))
    for payout in Payout.objects.filter(account=account, cancelled_at__isnull=True).select_related("user"):
        rows.append((payout.paid_on, "payout", f"Maosh: {payout.user.full_name}", -D(payout.amount_uzs)))
    for adj in Adjustment.objects.filter(account=account, kind="advance").select_related("user"):
        rows.append((timezone.localtime(adj.created_at).date(), "advance", f"Avans: {adj.user.full_name}",
                     -D(adj.amount_uzs)))
    for w in PartnerWithdrawal.objects.filter(account=account, cancelled_at__isnull=True).select_related("partner"):
        rows.append((w.taken_on, "withdrawal", f"Sherik oldi: {w.partner.name}", -D(w.amount)))
    transfers = AccountTransfer.objects.filter(cancelled_at__isnull=True).select_related("from_account", "to_account")
    for t in transfers.filter(from_account=account):
        rows.append((t.moved_on, "transfer", f"O‘tkazma → {t.to_account.name}", -D(t.amount)))
    for t in transfers.filter(to_account=account):
        rows.append((t.moved_on, "transfer", f"O‘tkazma ← {t.from_account.name}", D(t.to_amount)))
    return sorted(rows, key=lambda row: row[0])


def balance(account, until=None):
    rows = account_rows(account)
    total = sum((row[3] for row in rows if until is None or row[0] <= until), D(0))
    return q(D(account.opening_balance) + total)


def statement(account, start, end):
    """Oy ko'chirmasi: boshidagi qoldiq, harakatlar va oxiridagi qoldiq."""
    rows = account_rows(account)
    running = D(account.opening_balance) + sum((row[3] for row in rows if row[0] < start), D(0))
    opening = q(running)
    items = []
    for day, kind, label, amount in rows:
        if start <= day <= end:
            running += amount
            items.append({"date": day, "kind": kind, "label": label, "amount": str(q(amount)),
                          "balance": str(q(running))})
    return {"opening": str(opening), "closing": str(q(running)), "items": items}


@transaction.atomic
def create_transfer(*, by, from_account, to_account, amount, moved_on, to_amount=None, note=""):
    if from_account.pk == to_account.pk:
        raise ValidationError({"to_account": "Bir hisobning o‘ziga o‘tkazib bo‘lmaydi"})
    if D(amount) <= 0:
        raise ValidationError({"amount": "Summa musbat bo‘lishi kerak"})
    ensure_month_open(moved_on, by)
    if from_account.currency == to_account.currency:
        to_amount = amount
    elif not to_amount:
        raise ValidationError({"to_amount": "Valyuta har xil: tushgan summani yozing"})
    transfer = AccountTransfer.objects.create(from_account=from_account, to_account=to_account, amount=q(amount),
                                              to_amount=q(to_amount), moved_on=moved_on, note=note, created_by=by)
    audit.log(by, "transfer.create", transfer, after=audit.snapshot(transfer))
    return transfer


def _cancel(entity, *, by, reason, day, action):
    if not (reason or "").strip():
        raise ValidationError({"reason": "Bekor qilish sababini yozing"})
    if entity.cancelled_at:
        raise ValidationError({"status": "Bu yozuv allaqachon bekor qilingan"})
    ensure_month_open(day, by)
    entity.cancelled_at = timezone.now()
    entity.cancel_reason = reason.strip()[:255]
    entity.save(update_fields=["cancelled_at", "cancel_reason"])
    audit.log(by, action, entity, comment=entity.cancel_reason)
    return entity


def cancel_transfer(transfer, *, by, reason):
    return _cancel(transfer, by=by, reason=reason, day=transfer.moved_on, action="transfer.cancel")


@transaction.atomic
def create_withdrawal(*, by, partner, amount, currency, taken_on, rate_to_uzs=None, account=None, note=""):
    """Sherik olgan pul xarajat emas: foydaga ta'sir qilmaydi, faqat kassadan chiqadi."""
    if D(amount) <= 0:
        raise ValidationError({"amount": "Summa musbat bo‘lishi kerak"})
    require_currency(account, currency)
    ensure_month_open(taken_on, by)
    rate = resolve_rate(currency, taken_on, rate_to_uzs)
    withdrawal = PartnerWithdrawal.objects.create(
        partner=partner, amount=q(amount), currency=currency, rate_to_uzs=rate,
        amount_uzs=to_uzs(amount, currency, rate), taken_on=taken_on, account=account, note=note, created_by=by,
    )
    audit.log(by, "withdrawal.create", withdrawal, after=audit.snapshot(withdrawal))
    return withdrawal


def cancel_withdrawal(withdrawal, *, by, reason):
    return _cancel(withdrawal, by=by, reason=reason, day=withdrawal.taken_on, action="withdrawal.cancel")


def run_recurring(today=None):
    """Oyning belgilangan kuni takroriy xarajatni (ijara, servis) yozadi. Oyiga bir marta."""
    from apps.accounts.models import User
    from apps.finance.models import RecurringExpense

    today = today or timezone.localdate()
    stamp = f"{today:%Y-%m}"
    created = []
    if MonthClose.is_closed(today):
        return created
    managers = User.objects.filter(role__in=access.MANAGEMENT_ROLES, is_active=True)
    for item in RecurringExpense.objects.filter(is_active=True, day_of_month__lte=today.day).exclude(last_month=stamp):
        try:
            rate = resolve_rate(item.currency, today)
        except ValidationError:
            notify(managers, "expense.recurring_failed", f"Takroriy xarajat yozilmadi: {item.description}",
                   body="Bugungi kurs yo‘q. Kursni kiriting.", link="/app/finance?tab=rates",
                   dedupe_key=f"recurfail:{item.pk}:{stamp}")
            continue
        with transaction.atomic():
            expense = Expense.objects.create(
                category=item.category, amount=item.amount, currency=item.currency, rate_to_uzs=rate,
                amount_uzs=to_uzs(item.amount, item.currency, rate), spent_on=today, account=item.account,
                project=item.project, description=item.description, status=Expense.APPROVED,
                created_by=item.created_by,
            )
            item.last_month = stamp
            item.save(update_fields=["last_month"])
        notify(managers, "expense.recurring", f"Takroriy xarajat yozildi: {item.description}",
               body=f"{q(item.amount)} {item.currency}", link="/app/finance?tab=expenses",
               dedupe_key=f"recur:{item.pk}:{stamp}")
        created.append(expense)
    return created
