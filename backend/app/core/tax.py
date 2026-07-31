"""Kuwait has no GST/VAT today -- every document (quotation, order,
purchase order) defaults to a 0% rate (Settings -> Tax, admin-only to
change). This exists so tax can be switched on later -- a rate change, a
law change, expansion to a market that does have one -- without any
schema or workflow rework, not because it's active now. One shared
computation instead of three copies, same reasoning as core/workflow.py
and app/services/capacity_service.py.
"""


def compute_tax(subtotal: float, tax_rate: float) -> tuple[float, float]:
    """Returns (tax_amount, total_amount) for a subtotal and a tax rate
    given as a percentage (e.g. 5 for 5%, 0 for none)."""
    tax_amount = round(subtotal * (tax_rate / 100), 2)
    total_amount = round(subtotal + tax_amount, 2)
    return tax_amount, total_amount
