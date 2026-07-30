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

from app.core.exceptions import ConflictError, ValidationAppError


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
