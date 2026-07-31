"""Discount + tax math shared by quotations, orders, and purchase
orders -- one implementation instead of three, same reasoning as
core/workflow.py and app/services/capacity_service.py.

Pricing flow for a document:
  1. Each line's own total already has its line-level discount applied
     (see price_line below) -- quantity * unit_price, minus that line's
     own discount_percent.
  2. subtotal_amount = sum of those already-discounted line totals.
  3. A document-level discount_percent is applied on top of the
     subtotal, producing discount_amount and a taxable_amount.
  4. tax_rate (see core/tax.py's original single-rate design, now folded
     in here) is applied to the taxable_amount, producing tax_amount.
  5. total_amount = taxable_amount + tax_amount.

Both discount_percents default to 0, same as tax_rate -- nothing about
existing documents or callers that never set a discount changes.
"""


def price_line(quantity: float, unit_price: float, discount_percent: float = 0) -> float:
    """A single line's total after its own discount -- quantity *
    unit_price, minus discount_percent of that."""
    gross = quantity * unit_price
    return round(gross - gross * (discount_percent / 100), 2)


def compute_document_totals(subtotal: float, discount_percent: float, tax_rate: float) -> dict:
    """subtotal is the sum of already line-discounted line totals. Returns
    discount_amount, taxable_amount, tax_amount, and total_amount for the
    document as a whole."""
    discount_amount = round(subtotal * (discount_percent / 100), 2)
    taxable_amount = round(subtotal - discount_amount, 2)
    tax_amount = round(taxable_amount * (tax_rate / 100), 2)
    total_amount = round(taxable_amount + tax_amount, 2)
    return {
        "discount_amount": discount_amount,
        "taxable_amount": taxable_amount,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
    }
