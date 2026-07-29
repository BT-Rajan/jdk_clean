"""Renders business documents (currently: quotations) to PDF bytes.

Kept dependency-light and framework-agnostic: functions take an already
loaded ORM object (with relationships eager-loaded by the caller/service)
and a plain dict of company/letterhead settings, and return raw PDF bytes
that the API layer streams back as a download.
"""

from datetime import date, datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_RIGHT
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from sqlalchemy.orm import Session

DEFAULT_COMPANY_SETTINGS = {
    "company_name": "Your Company Name",
    "company_address": "",
    "company_phone": "",
    "company_email": "",
    "company_gstin": "",
}


def get_company_settings(db: Session) -> dict:
    """Reads letterhead fields via settings_service, falling back to sane
    placeholder text for any field that hasn't been configured yet."""
    from app.services import settings_service

    values = settings_service.get_all(db)
    return {key: (values.get(key) or default) for key, default in DEFAULT_COMPANY_SETTINGS.items()}


def _fmt_money(value) -> str:
    return f"{float(value):,.2f}"


def _fmt_date(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, (date, datetime)):
        return value.strftime("%d-%b-%Y")
    return str(value)


def generate_quotation_pdf(quotation, company_settings: dict | None = None) -> bytes:
    """Builds a one-page-per-quotation PDF and returns it as bytes.

    `quotation` is a Quotation ORM instance with `.customer` and `.lines`
    (each line with `.product`) already loaded.
    """
    settings = {**DEFAULT_COMPANY_SETTINGS, **(company_settings or {})}
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=f"Quotation {quotation.quotation_number}",
    )

    styles = getSampleStyleSheet()
    small_muted = ParagraphStyle(
        "SmallMuted", parent=styles["Normal"], fontSize=9, textColor=colors.grey
    )
    right_align = ParagraphStyle("RightAlign", parent=styles["Normal"], alignment=TA_RIGHT)

    story = []

    # --- Letterhead -----------------------------------------------------
    header_rows = [
        [
            Paragraph(f"<b>{settings['company_name']}</b>", styles["Heading2"]),
            Paragraph(
                f"<b>QUOTATION</b><br/>{quotation.quotation_number}", right_align
            ),
        ]
    ]
    header_table = Table(header_rows, colWidths=[110 * mm, 60 * mm])
    header_table.setStyle(
        TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT")])
    )
    story.append(header_table)

    contact_bits = [
        b
        for b in [settings.get("company_address"), settings.get("company_phone"), settings.get("company_email")]
        if b
    ]
    if contact_bits:
        story.append(Paragraph(" &bull; ".join(contact_bits), small_muted))
    story.append(Spacer(1, 8 * mm))

    # --- Customer + meta block -------------------------------------------
    customer = quotation.customer
    customer_lines = [f"<b>{customer.name}</b>" if customer else "<b>Customer</b>"]
    if customer:
        if customer.billing_address:
            customer_lines.append(customer.billing_address)
        if customer.city or customer.country:
            customer_lines.append(", ".join(filter(None, [customer.city, customer.country])))
        if customer.email:
            customer_lines.append(customer.email)
        if customer.phone:
            customer_lines.append(customer.phone)

    meta_lines = [
        f"Quotation Date: {_fmt_date(quotation.quotation_date)}",
        f"Valid Until: {_fmt_date(quotation.valid_until)}",
        f"Status: {quotation.status.upper()}",
    ]

    meta_table = Table(
        [
            [
                Paragraph("<br/>".join(customer_lines), styles["Normal"]),
                Paragraph("<br/>".join(meta_lines), right_align),
            ]
        ],
        colWidths=[110 * mm, 60 * mm],
    )
    meta_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(meta_table)
    story.append(Spacer(1, 8 * mm))

    # --- Line items -------------------------------------------------------
    table_data = [["#", "Product", "Qty", "Unit", "Unit Price", "Line Total"]]
    for idx, line in enumerate(quotation.lines, start=1):
        product = line.product
        table_data.append(
            [
                str(idx),
                f"{product.code} - {product.name}" if product else str(line.product_id),
                f"{float(line.quantity):g}",
                product.unit if product else "",
                _fmt_money(line.unit_price),
                _fmt_money(line.line_total),
            ]
        )

    items_table = Table(
        table_data,
        colWidths=[8 * mm, 75 * mm, 18 * mm, 18 * mm, 27 * mm, 28 * mm],
        repeatRows=1,
    )
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d3748")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (1, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafc")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 4 * mm))

    # --- Total ------------------------------------------------------------
    total_table = Table(
        [["", "Total", _fmt_money(quotation.total_amount)]],
        colWidths=[121 * mm, 25 * mm, 28 * mm],
    )
    total_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (1, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("LINEABOVE", (1, 0), (-1, 0), 0.75, colors.black),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(total_table)

    if quotation.notes:
        story.append(Spacer(1, 8 * mm))
        story.append(Paragraph("<b>Notes</b>", styles["Heading4"]))
        story.append(Paragraph(quotation.notes.replace("\n", "<br/>"), styles["Normal"]))

    story.append(Spacer(1, 12 * mm))
    story.append(
        Paragraph(
            "This is a system-generated quotation and is valid until the date shown above.",
            small_muted,
        )
    )

    doc.build(story)
    return buffer.getvalue()
