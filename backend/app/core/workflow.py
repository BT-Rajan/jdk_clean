"""One shared implementation of the transition-checking logic that used
to be hand-copied into order_service, quotation_service,
purchase_order_service, production_service, and feasibility_service --
each maintaining its own near-identical

    allowed = ALLOWED_TRANSITIONS.get(current_status, set())
    if new_status not in allowed:
        raise ConflictError(f"Cannot move X from '{current_status}' to '{new_status}'.")

with its own slightly different error wording. One implementation here
means one place to get it right, and one place a future status rule
(e.g. "this transition always needs a reason") can be added once instead
of five times.

This does NOT force a single universal status enum across modules --
each module's ALLOWED_TRANSITIONS table still encodes its own genuinely
different states (an order's states aren't a quotation's states aren't a
feasibility check's states). What's shared is the *mechanism* for
checking a transition against whichever table a module defines, not the
states themselves.
"""

from datetime import date, timedelta

from app.core.exceptions import ConflictError, ValidationAppError

# How many days in the past a "quick log" entry (production output, a
# sale) can be backdated to -- e.g. logging yesterday's production the
# next morning is fine, but the books shouldn't be rewritable
# indefinitely. Shared by production_service.log_production and
# order_service.log_sale, and by calendar_service's day-snapshot (to
# tell the frontend whether "Log production"/"Log a sale" should even
# be offered for a given day).
MAX_BACKDATE_DAYS = 3


def is_within_backdate_window(entry_date: date, today: date) -> bool:
    return today - timedelta(days=MAX_BACKDATE_DAYS) <= entry_date <= today


def assert_within_backdate_window(entry_date: date, today: date, entity_label: str) -> None:
    """Raises ValidationAppError if `entry_date` is in the future, or
    more than MAX_BACKDATE_DAYS in the past relative to `today`."""
    if entry_date > today:
        raise ValidationAppError(f"Cannot log {entity_label} for a future date.")
    if not is_within_backdate_window(entry_date, today):
        earliest = today - timedelta(days=MAX_BACKDATE_DAYS)
        raise ValidationAppError(
            f"Cannot log {entity_label} more than {MAX_BACKDATE_DAYS} days in the past "
            f"(earliest allowed: {earliest.isoformat()})."
        )


def assert_transition_allowed(
    allowed_transitions: dict[str, set[str]],
    current_status: str,
    new_status: str,
    entity_label: str,
) -> None:
    """Raises ConflictError if `new_status` isn't reachable from
    `current_status` per `allowed_transitions` (a module's own
    ALLOWED_TRANSITIONS table -- ownership of what states exist and how
    they connect stays with each module; only the check itself is
    shared). `entity_label` is what shows in the error, e.g. "order",
    "feasibility check".
    """
    allowed = allowed_transitions.get(current_status, set())
    if new_status not in allowed:
        raise ConflictError(
            f"Cannot move {entity_label} from '{current_status}' to '{new_status}'."
        )


def assert_reason_given(reason: str | None, message: str) -> None:
    """Raises ValidationAppError with `message` if `reason` is missing or
    blank. Shared by every module where a transition (closing without
    converting, cancelling, overriding) requires Sales/whoever to say why.
    """
    if not (reason and reason.strip()):
        raise ValidationAppError(message)
