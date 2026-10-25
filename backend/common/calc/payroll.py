"""Foizli maosh hisob-kitobi (sof funksiyalar, bazaga tegmaydi).

Qoida uch darajada bo'ladi: loyiha → tarif → umumiy. Har darajada amal qilish sanasi (valid_from)
bo'yicha eng oxirgi qoida olinadi. Foiz o'zgarsa, o'tgan to'lovlar qayta hisoblanmaydi.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from itertools import groupby

from common.money import CENT, D, percent_of, q


@dataclass(frozen=True)
class Rule:
    position: str
    percent: Decimal
    valid_from: date
    tariff_id: int | None = None
    project_id: int | None = None


@dataclass(frozen=True)
class Assignment:
    user_id: int
    position: str
    share_percent: Decimal | None = None


@dataclass(frozen=True)
class AccrualLine:
    user_id: int
    position: str
    percent: Decimal
    amount: Decimal


def resolve_percent(rules, position, *, on, tariff_id=None, project_id=None):
    """Lavozim uchun amaldagi foizni topadi. Qoida topilmasa None."""
    candidates = [r for r in rules if r.position == position and r.valid_from <= on]
    scopes = (
        lambda r: project_id is not None and r.project_id == project_id,
        lambda r: r.project_id is None and tariff_id is not None and r.tariff_id == tariff_id,
        lambda r: r.project_id is None and r.tariff_id is None,
    )
    for in_scope in scopes:
        scoped = [r for r in candidates if in_scope(r)]
        if scoped:
            return D(max(scoped, key=lambda r: r.valid_from).percent)
    return None


def _split_evenly(total: Decimal, parts: int) -> list[Decimal]:
    """Summani teng bo'ladi, qoldiq tiyinlar birinchilarga qo'shiladi. Yig'indi aynan total."""
    base = (total / parts).quantize(CENT, rounding="ROUND_DOWN")
    remainder = int((total - base * parts) / CENT)
    return [base + (CENT if i < remainder else 0) for i in range(parts)]


def split_payment(base_amount, assignments, rules, *, on, tariff_id=None, project_id=None):
    """To'lovdan har bir biriktirilgan xodimga tushadigan ulushni hisoblaydi.

    - assignment.share_percent berilgan bo'lsa, o'sha foiz ishlatiladi (loyihada qo'lda bo'lish).
    - berilmagan bo'lsa, lavozim qoidasi foizi shu lavozimdagi qolgan odamlarga teng bo'linadi.
    """
    base_amount = q(base_amount)
    if base_amount <= 0:
        return []
    lines: list[AccrualLine] = []
    ordered = sorted(assignments, key=lambda a: (a.position, a.user_id))
    for position, group in groupby(ordered, key=lambda a: a.position):
        group = list(group)
        explicit = [a for a in group if a.share_percent is not None]
        implicit = [a for a in group if a.share_percent is None]
        for a in explicit:
            lines.append(AccrualLine(a.user_id, position, D(a.share_percent), percent_of(base_amount, a.share_percent)))
        if not implicit:
            continue
        rule_percent = resolve_percent(rules, position, on=on, tariff_id=tariff_id, project_id=project_id)
        if not rule_percent:
            continue
        total = percent_of(base_amount, rule_percent)
        each_percent = (rule_percent / len(implicit)).quantize(Decimal("0.0001"))
        for a, amount in zip(implicit, _split_evenly(total, len(implicit)), strict=True):
            lines.append(AccrualLine(a.user_id, position, each_percent, amount))
    return lines


def team_share_percent(rules, positions, *, on, tariff_id=None, project_id=None) -> Decimal:
    """Jamoaga jami necha foiz ketishi (masalan, 20 + 12,5 + 12,5 = 45)."""
    total = Decimal("0")
    for position in positions:
        total += resolve_percent(rules, position, on=on, tariff_id=tariff_id, project_id=project_id) or 0
    return total
