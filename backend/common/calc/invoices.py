"""Hisob-faktura va to'lov hisob-kitobi (sof funksiyalar)."""
import calendar
from datetime import date, timedelta
from decimal import Decimal

from common.money import D, q

DRAFT = "draft"
OPEN = "open"
PARTIAL = "partial"
PAID = "paid"
OVERDUE = "overdue"
CANCELLED = "cancelled"

STATUS_LABELS = {
    DRAFT: "Qoralama",
    OPEN: "Ochiq",
    PARTIAL: "Qisman to‘langan",
    PAID: "To‘langan",
    OVERDUE: "Muddati o‘tgan",
    CANCELLED: "Bekor qilingan",
}


def invoice_status(*, issued: bool, cancelled: bool, total, paid, due_date: date, today: date) -> str:
    total, paid = D(total), D(paid)
    if cancelled:
        return CANCELLED
    if not issued:
        return DRAFT
    if paid >= total:
        return PAID
    if today > due_date:
        return OVERDUE
    if paid > 0:
        return PARTIAL
    return OPEN


def allocate_fifo(amount, open_invoices):
    """To'lovni eng eski ochiq hisob-fakturalardan boshlab taqsimlaydi.

    open_invoices: [(invoice_id, qoldiq), ...] — eng eskisi birinchi.
    Qaytaradi: ([(invoice_id, summa), ...], ortib qolgan avans).
    """
    remaining = q(amount)
    allocations = []
    for invoice_id, outstanding in open_invoices:
        if remaining <= 0:
            break
        outstanding = q(outstanding)
        if outstanding <= 0:
            continue
        part = min(remaining, outstanding)
        allocations.append((invoice_id, part))
        remaining -= part
    return allocations, q(remaining)


def accrual_base(allocated_amount, invoice_total, transit_total) -> Decimal:
    """Maosh foizi olinadigan summa: to'lovning tranzit (reklama budjeti) bo'lmagan qismi."""
    invoice_total, transit_total = D(invoice_total), D(transit_total)
    if invoice_total <= 0:
        return Decimal("0.00")
    own_share = (invoice_total - transit_total) / invoice_total
    return q(D(allocated_amount) * own_share)


def add_months(day: date, months: int, anchor_day: int | None = None) -> date:
    """Sanaga oy qo'shadi. 31-sanadan boshlangan loyiha fevralda 28/29 ga tushadi."""
    anchor_day = anchor_day or day.day
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(anchor_day, last))


def billing_period(start_date: date, index: int) -> tuple[date, date]:
    """Loyihaning index-oyi (0 dan) uchun to'lov davri: [boshi, oxiri]."""
    begin = add_months(start_date, index, start_date.day)
    end = add_months(start_date, index + 1, start_date.day) - timedelta(days=1)
    return begin, end


def period_index_for(start_date: date, on: date) -> int:
    """on sanasi loyihaning nechanchi davriga tushadi (boshlanishidan oldin bo'lsa -1)."""
    if on < start_date:
        return -1
    index = (on.year - start_date.year) * 12 + (on.month - start_date.month)
    begin, _ = billing_period(start_date, index)
    if on < begin:
        index -= 1
    return index
