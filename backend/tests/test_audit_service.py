"""Regression tests for audit_service.get_my_history -- backs GET
/api/auth/me/history, the mobile app's own "History" drawer link. Not
to be confused with get_history (one record's full trail, any actor):
this is one actor's full trail, restricted to a calendar month.
"""

from datetime import date, datetime

import pytest
from sqlalchemy import text

from app.core.exceptions import ValidationAppError
from app.services import audit_service

USER_A = 9001
USER_B = 9002


def _insert(db, *, table_name, record_id, action, changed_by, changed_at):
    db.execute(
        text(
            """INSERT INTO audit_log (table_name, record_id, action, changed_by, changed_at)
               VALUES (:t, :r, :a, :u, :at)"""
        ),
        {"t": table_name, "r": record_id, "a": action, "u": changed_by, "at": changed_at},
    )


def test_only_this_users_rows_come_back(db):
    _insert(db, table_name="customers", record_id=1, action="CREATE", changed_by=USER_A, changed_at=datetime(2026, 3, 5))
    _insert(db, table_name="customers", record_id=2, action="CREATE", changed_by=USER_B, changed_at=datetime(2026, 3, 5))

    rows = audit_service.get_my_history(db, USER_A, month="2026-03")

    assert len(rows) == 1
    assert rows[0]["record_id"] == 1


def test_restricted_to_the_given_calendar_month(db):
    _insert(db, table_name="quotations", record_id=1, action="CREATE", changed_by=USER_A, changed_at=datetime(2026, 2, 28, 23, 59, 59))
    _insert(db, table_name="quotations", record_id=2, action="CREATE", changed_by=USER_A, changed_at=datetime(2026, 3, 1, 0, 0, 0))
    _insert(db, table_name="quotations", record_id=3, action="CREATE", changed_by=USER_A, changed_at=datetime(2026, 3, 31, 23, 59, 59))
    _insert(db, table_name="quotations", record_id=4, action="CREATE", changed_by=USER_A, changed_at=datetime(2026, 4, 1, 0, 0, 0))

    rows = audit_service.get_my_history(db, USER_A, month="2026-03")

    assert {r["record_id"] for r in rows} == {2, 3}


def test_december_month_boundary_rolls_into_next_year(db):
    """The trickiest edge in the month->date-range math -- December's
    "next month" is January of the *following* year."""
    _insert(db, table_name="quotations", record_id=1, action="CREATE", changed_by=USER_A, changed_at=datetime(2026, 12, 31, 23, 59, 59))
    _insert(db, table_name="quotations", record_id=2, action="CREATE", changed_by=USER_A, changed_at=datetime(2027, 1, 1, 0, 0, 0))

    rows = audit_service.get_my_history(db, USER_A, month="2026-12")

    assert [r["record_id"] for r in rows] == [1]


def test_no_month_defaults_to_the_current_calendar_month(db):
    today = date.today()
    in_month = datetime(today.year, today.month, 15)
    _insert(db, table_name="customers", record_id=1, action="CREATE", changed_by=USER_A, changed_at=in_month)
    # A row from a year ago, same day-of-month, is outside the *current*
    # month unless today happens to be exactly one year after itself --
    # safe as a "shouldn't show up" control row for any test run date.
    _insert(db, table_name="customers", record_id=2, action="CREATE", changed_by=USER_A, changed_at=datetime(today.year - 1, today.month, 15))

    rows = audit_service.get_my_history(db, USER_A, month=None)

    assert [r["record_id"] for r in rows] == [1]


def test_malformed_month_is_rejected(db):
    with pytest.raises(ValidationAppError):
        audit_service.get_my_history(db, USER_A, month="not-a-month")


def test_out_of_range_month_number_is_rejected(db):
    with pytest.raises(ValidationAppError):
        audit_service.get_my_history(db, USER_A, month="2026-13")
