from datetime import date, datetime, timezone


def not_in_past(value: date | None) -> date | None:
    """Rejects a date field that's before today (server's UTC date).
    Shared by every schema whose date fields shouldn't be backdated --
    feasibility's required_by_date, quotations' quotation_date, orders'
    order_date/requested_delivery_date, delivery notes' delivery_date.
    None passes through untouched (field is optional or being cleared).
    """
    if value is None:
        return value
    today = datetime.now(timezone.utc).date()
    if value < today:
        raise ValueError(f"Date cannot be in the past (today is {today.isoformat()}).")
    return value
