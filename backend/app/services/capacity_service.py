"""Vacant-slot capacity scanning: given a machine's daily capacity and
what's already booked against it, find the first day enough free time has
accumulated to cover a required number of hours. Originally built for
feasibility_service's capacity check (does this product have machine time
before the required-by date); now also used by order_service to actually
pick real dates when auto-scheduling a production batch on order confirm.
One implementation, two callers -- same "build once, reuse" reasoning as
app/core/workflow.py.
"""

from datetime import date, timedelta

from app.models.production_schedule import ProductionSchedule

# Statuses whose booked hours count against a machine's free capacity.
BOOKED_PRODUCTION_STATUSES = ("planned", "in_progress")

# How far forward a scan looks before giving up and reporting "not
# achievable in the foreseeable future" rather than scanning forever.
MAX_SCAN_DAYS = 365


def daily_booked_hours(
    batches: list[ProductionSchedule], hours_field: str = "machine"
) -> dict[date, float]:
    """Spreads each batch's total required hours evenly across the days it's
    scheduled over, so a 5-day batch doesn't count as fully consuming
    capacity on every one of those days at once. `hours_field` selects
    whether to spread machine-hours or worker-hours (a batch's product may
    have both, at different totals)."""
    daily: dict[date, float] = {}
    for batch in batches:
        product = batch.product
        if product is None or product.production_hours_per_unit is None:
            continue
        span_days = (batch.scheduled_end - batch.scheduled_start).days + 1
        if span_days <= 0:
            continue
        batch_hours = float(batch.planned_quantity) * float(product.production_hours_per_unit)
        if hours_field == "workers":
            if not product.workers_required:
                continue
            batch_hours *= product.workers_required
        per_day = batch_hours / span_days
        d = batch.scheduled_start
        while d <= batch.scheduled_end:
            daily[d] = daily.get(d, 0.0) + per_day
            d += timedelta(days=1)
    return daily


def find_vacant_slot_completion(
    daily_capacity: float, daily_booked: dict[date, float], required_hours: float, today: date
) -> date | None:
    """Scans forward day by day from `today`, accumulating free capacity
    (daily_capacity minus whatever's already booked that day), and returns
    the first date by which enough cumulative free time has opened up to
    cover `required_hours` -- i.e. identifies the actual vacant slot rather
    than just comparing aggregate totals. None if not achievable within
    MAX_SCAN_DAYS."""
    if required_hours <= 0:
        return today
    cumulative_free = 0.0
    d = today
    for _ in range(MAX_SCAN_DAYS):
        free_today = max(daily_capacity - daily_booked.get(d, 0.0), 0.0)
        cumulative_free += free_today
        if cumulative_free >= required_hours:
            return d
        d += timedelta(days=1)
    return None
