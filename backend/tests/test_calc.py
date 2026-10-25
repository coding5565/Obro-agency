"""Sof hisob funksiyalari testlari (bazasiz)."""
from datetime import date
from decimal import Decimal

import pytest

from common.calc import invoices as inv
from common.calc.payroll import Assignment, Rule, resolve_percent, split_payment, team_share_percent
from common.calc.progress import AHEAD, BEHIND, ON_TRACK, pace
from common.money import D, percent_of, q, to_uzs

GLOBAL_RULES = [
    Rule("smm_target", Decimal("20"), date(2026, 1, 1)),
    Rule("video_mobilo", Decimal("12.5"), date(2026, 1, 1)),
    Rule("design_montage", Decimal("12.5"), date(2026, 1, 1)),
]
TEAM = [
    Assignment(1, "smm_target"),
    Assignment(2, "video_mobilo"),
    Assignment(3, "design_montage"),
]


class TestMoney:
    def test_float_rejected(self):
        with pytest.raises(TypeError):
            D(0.1)

    def test_rounding_half_up(self):
        assert q("187.505") == Decimal("187.51")

    def test_to_uzs(self):
        assert to_uzs("1000", "USD", "12650.50") == Decimal("12650500.00")
        assert to_uzs("500000", "UZS", None) == Decimal("500000.00")

    def test_to_uzs_requires_rate(self):
        with pytest.raises(ValueError):
            to_uzs("10", "USD", 0)

    def test_percent_of(self):
        assert percent_of("1500", "12.5") == Decimal("187.50")


class TestPayroll:
    @pytest.mark.parametrize(
        "price, smm, video, design",
        [("800", "160.00", "100.00", "100.00"), ("1000", "200.00", "125.00", "125.00"),
         ("1500", "300.00", "187.50", "187.50")],
    )
    def test_offer_examples(self, price, smm, video, design):
        lines = split_payment(price, TEAM, GLOBAL_RULES, on=date(2026, 11, 1))
        amounts = {line.position: line.amount for line in lines}
        assert amounts == {"smm_target": D(smm), "video_mobilo": D(video), "design_montage": D(design)}

    def test_team_share_is_45(self):
        positions = ["smm_target", "video_mobilo", "design_montage"]
        assert team_share_percent(GLOBAL_RULES, positions, on=date(2026, 11, 1)) == Decimal("45")

    def test_tariff_rule_overrides_global(self):
        rules = GLOBAL_RULES + [Rule("design_montage", Decimal("15"), date(2026, 1, 1), tariff_id=3)]
        assert resolve_percent(rules, "design_montage", on=date(2026, 11, 1), tariff_id=3) == Decimal("15")
        assert resolve_percent(rules, "design_montage", on=date(2026, 11, 1), tariff_id=2) == Decimal("12.5")

    def test_project_rule_overrides_tariff(self):
        rules = GLOBAL_RULES + [
            Rule("smm_target", Decimal("22"), date(2026, 1, 1), tariff_id=3),
            Rule("smm_target", Decimal("18"), date(2026, 1, 1), project_id=9),
        ]
        assert resolve_percent(rules, "smm_target", on=date(2026, 11, 1), tariff_id=3, project_id=9) == Decimal("18")

    def test_new_rule_does_not_rewrite_history(self):
        rules = GLOBAL_RULES + [Rule("smm_target", Decimal("25"), date(2027, 1, 1))]
        assert resolve_percent(rules, "smm_target", on=date(2026, 12, 31)) == Decimal("20")
        assert resolve_percent(rules, "smm_target", on=date(2027, 1, 1)) == Decimal("25")

    def test_rule_not_yet_valid(self):
        rules = [Rule("smm_target", Decimal("20"), date(2027, 1, 1))]
        assert resolve_percent(rules, "smm_target", on=date(2026, 6, 1)) is None

    def test_two_people_split_rule_evenly(self):
        team = [Assignment(1, "smm_target"), Assignment(4, "smm_target")]
        lines = split_payment("1000", team, GLOBAL_RULES, on=date(2026, 11, 1))
        assert [line.amount for line in lines] == [Decimal("100.00"), Decimal("100.00")]
        assert all(line.percent == Decimal("10") for line in lines)

    def test_uneven_split_keeps_total(self):
        team = [Assignment(i, "video_mobilo") for i in (1, 2, 3)]
        lines = split_payment("1000", team, GLOBAL_RULES, on=date(2026, 11, 1))
        assert sum(line.amount for line in lines) == Decimal("125.00")
        assert [line.amount for line in lines] == [Decimal("41.67"), Decimal("41.67"), Decimal("41.66")]

    def test_explicit_share_used(self):
        team = [Assignment(1, "smm_target", Decimal("10")), Assignment(4, "smm_target", Decimal("10"))]
        lines = split_payment("1000", team, GLOBAL_RULES, on=date(2026, 11, 1))
        assert sum(line.amount for line in lines) == Decimal("200.00")

    def test_position_without_rule_gets_nothing(self):
        lines = split_payment("1000", [Assignment(7, "brandface")], GLOBAL_RULES, on=date(2026, 11, 1))
        assert lines == []

    def test_zero_payment(self):
        assert split_payment("0", TEAM, GLOBAL_RULES, on=date(2026, 11, 1)) == []


class TestInvoices:
    def test_statuses(self):
        kw = dict(issued=True, cancelled=False, total="1000", due_date=date(2026, 11, 5))
        assert inv.invoice_status(paid="0", today=date(2026, 11, 3), **kw) == inv.OPEN
        assert inv.invoice_status(paid="400", today=date(2026, 11, 3), **kw) == inv.PARTIAL
        assert inv.invoice_status(paid="400", today=date(2026, 11, 6), **kw) == inv.OVERDUE
        assert inv.invoice_status(paid="1000", today=date(2026, 12, 6), **kw) == inv.PAID
        assert inv.invoice_status(paid="0", today=date(2026, 11, 3), **{**kw, "issued": False}) == inv.DRAFT
        assert inv.invoice_status(paid="0", today=date(2026, 11, 3), **{**kw, "cancelled": True}) == inv.CANCELLED

    def test_allocate_fifo_with_prepayment(self):
        allocations, left = inv.allocate_fifo("2500", [(1, "1000"), (2, "1000")])
        assert allocations == [(1, Decimal("1000.00")), (2, Decimal("1000.00"))]
        assert left == Decimal("500.00")

    def test_allocate_fifo_partial(self):
        allocations, left = inv.allocate_fifo("300", [(1, "0"), (2, "1000")])
        assert allocations == [(2, Decimal("300.00"))]
        assert left == Decimal("0.00")

    def test_accrual_base_excludes_transit(self):
        # 1000$ tarif + 500$ reklama budjeti (tranzit), mijoz to'liq 1500$ to'ladi
        assert inv.accrual_base("1500", "1500", "500") == Decimal("1000.00")
        assert inv.accrual_base("750", "1500", "500") == Decimal("500.00")

    def test_billing_period_month_end(self):
        assert inv.billing_period(date(2026, 1, 31), 1) == (date(2026, 2, 28), date(2026, 3, 30))
        assert inv.billing_period(date(2026, 11, 10), 0) == (date(2026, 11, 10), date(2026, 12, 9))
        assert inv.billing_period(date(2026, 11, 10), 2) == (date(2027, 1, 10), date(2027, 2, 9))

    def test_period_index(self):
        start = date(2026, 11, 10)
        assert inv.period_index_for(start, date(2026, 11, 9)) == -1
        assert inv.period_index_for(start, date(2026, 11, 10)) == 0
        assert inv.period_index_for(start, date(2026, 12, 9)) == 0
        assert inv.period_index_for(start, date(2026, 12, 10)) == 1


class TestProgress:
    def test_on_track(self):
        result = pace(done=8, planned=12, elapsed_days=18, period_days=30)
        assert result["status"] == ON_TRACK and result["time_percent"] == 60 and result["done_percent"] == 67

    def test_behind(self):
        assert pace(done=2, planned=12, elapsed_days=20, period_days=30)["status"] == BEHIND

    def test_ahead(self):
        assert pace(done=10, planned=12, elapsed_days=10, period_days=30)["status"] == AHEAD
