"""Tarif limiti bajarilish sur'ati: «oyning 60% o'tdi, 64% bajarildi»."""
from decimal import Decimal

AHEAD = "ahead"
ON_TRACK = "on_track"
BEHIND = "behind"

# Rejadan 15% dan ko'p orqada qolsa — «orqada».
BEHIND_TOLERANCE = Decimal("0.85")


def pace(done: int, planned: int, elapsed_days: int, period_days: int) -> dict:
    if planned <= 0 or period_days <= 0:
        return {"done": done, "planned": planned, "time_percent": 0, "done_percent": 0, "status": ON_TRACK}
    time_share = Decimal(min(max(elapsed_days, 0), period_days)) / Decimal(period_days)
    done_share = Decimal(done) / Decimal(planned)
    expected = Decimal(planned) * time_share
    if done_share >= time_share + Decimal("0.10"):
        status = AHEAD
    elif Decimal(done) < expected * BEHIND_TOLERANCE:
        status = BEHIND
    else:
        status = ON_TRACK
    return {
        "done": done,
        "planned": planned,
        "time_percent": int((time_share * 100).to_integral_value()),
        "done_percent": int((done_share * 100).to_integral_value()),
        "status": status,
    }
