from datetime import date, datetime, timedelta, timezone

# Kuwait is UTC+3 year-round (no DST) -- a fixed offset rather than a
# zoneinfo lookup, so this works even on a minimal image without a
# timezone database installed. The business this app runs for operates
# on Kuwait's calendar day, so every "is this date in the past/future"
# check needs to agree with what a person in Kuwait sees on their own
# clock -- comparing against server UTC instead is wrong for roughly
# three hours around each UTC midnight (Kuwait's day has already
# rolled over while UTC's hasn't yet), which is exactly the window a
# 'today' date entered in the evening/late night can spuriously get
# rejected as "in the past" or "in the future".
KUWAIT_TZ = timezone(timedelta(hours=3))


def today_kuwait() -> date:
    """The current calendar date in Kuwait, independent of the server's
    own timezone. Use this (not `datetime.now(timezone.utc).date()`)
    anywhere "today" gates or defaults a date a person entered or reads
    on screen -- see core/validators.py's not_in_past/not_in_future."""
    return datetime.now(timezone.utc).astimezone(KUWAIT_TZ).date()
