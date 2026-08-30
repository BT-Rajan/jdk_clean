"""Renders business documents (quotations, orders, purchase orders,
delivery notes) to PDF bytes.

Kept dependency-light and framework-agnostic: each generate_*_pdf()
function takes an already loaded ORM object (with relationships
eager-loaded by the caller/service), a plain dict of company/letterhead
settings, and an optional signer (name + image path), and returns raw
PDF bytes that the API layer streams back as a download.

All four documents share the same shape (letterhead, party + meta block,
line items table, total, notes, signature), so the actual rendering
lives in one shared _render_document() -- each generate_*_pdf() is a
short adapter that shapes its document's data into that call rather than
repeating ~200 lines of reportlab flowable-building four times.
"""

from datetime import date, datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_RIGHT
from reportlab.platypus import (
    Image as RLImage,
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
}


def resolve_signer(db: Session, created_by_user_id: int | None) -> tuple[str | None, Path | None]:
    """Looks up the (name, signature_path) tuple for a document's creator,
    for passing as the `signer` argument to any generate_*_pdf() function.
    Returns (None, None) if the document has no recorded creator, the user
    was deleted, or they simply don't have a signature assigned yet --
    the caller still gets a document, just with a blank signature line
    (see _signature_block above).
    """
    from app.models.user import User
    from app.services import signature_service

    if created_by_user_id is None:
        return None, None
    user = db.query(User).filter(User.id == created_by_user_id).first()
    if user is None:
        return None, None
    return user.full_name, signature_service.get_signature_path(user)


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


def _signature_block(styles, signer_name: str | None, signature_path: Path | None) -> list:
    """Flowables for the signature line every outbound document ends with.
    If the creator has an admin-assigned signature image (see
    signature_service.py), it's embedded above the line; either way the
    printed name (or a generic "Authorized Signatory" if unknown) appears
    below it, so every document has *a* signature line even when no image
    has been assigned yet.
    """
    small_muted = ParagraphStyle("SigMuted", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    name_style = ParagraphStyle("SigName", parent=styles["Normal"], fontSize=9)

    elements = [Spacer(1, 14 * mm)]
    if signature_path is not None and signature_path.is_file():
        try:
            elements.append(RLImage(str(signature_path), width=42 * mm, height=16 * mm, kind="proportional"))
        except Exception:
            elements.append(Spacer(1, 16 * mm))
    else:
        elements.append(Spacer(1, 16 * mm))

    line_table = Table([[""]], colWidths=[55 * mm])
    line_table.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.grey)]))
    elements.append(line_table)
    elements.append(Paragraph(signer_name or "Authorized Signatory", name_style))
    if signer_name:
        elements.append(Paragraph("Authorized Signatory", small_muted))
    return elements


def _render_document(
    *,
    doc_label: str,
    doc_number: str,
    company_settings: dict,
    party_lines: list[str],
    meta_lines: list[str],
    table_header: list[str],
    rows: list[list[str]],
    col_widths: list[float],
    total_label: str | None,
    total_value: str | None,
    notes: str | None,
    footer_note: str,
    signer_name: str | None,
    signature_path: Path | None,
) -> bytes:
    settings = {**DEFAULT_COMPANY_SETTINGS, **(company_settings or {})}
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=f"{doc_label} {doc_number}",
    )

    styles = getSampleStyleSheet()
    small_muted = ParagraphStyle("SmallMuted", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    right_align = ParagraphStyle("RightAlign", parent=styles["Normal"], alignment=TA_RIGHT)

    story = []

    # --- Letterhead -----------------------------------------------------
    header_rows = [
        [
            Paragraph(f"<b>{settings['company_name']}</b>", styles["Heading2"]),
            Paragraph(f"<b>{doc_label}</b><br/>{doc_number}", right_align),
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

    # --- Party + meta block ----------------------------------------------
    meta_table = Table(
        [
            [
                Paragraph("<br/>".join(party_lines), styles["Normal"]),
                Paragraph("<br/>".join(meta_lines), right_align),
            ]
        ],
        colWidths=[110 * mm, 60 * mm],
    )
    meta_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(meta_table)
    story.append(Spacer(1, 8 * mm))

    # --- Line items ---------------------------------------------------------
    table_data = [table_header] + rows
    items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
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

    # --- Total (optional -- a delivery note has no monetary total) --------
    if total_label is not None:
        label_width = sum(col_widths) - 25 * mm - 28 * mm
        total_table = Table(
            [["", total_label, total_value]],
            colWidths=[label_width, 25 * mm, 28 * mm],
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

    if notes:
        story.append(Spacer(1, 8 * mm))
        story.append(Paragraph("<b>Notes</b>", styles["Heading4"]))
        story.append(Paragraph(notes.replace("\n", "<br/>"), styles["Normal"]))

    story.extend(_signature_block(styles, signer_name, signature_path))

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(footer_note, small_muted))

    doc.build(story)
    return buffer.getvalue()


def generate_quotation_pdf(quotation, company_settings: dict | None = None, signer=None) -> bytes:
    """`quotation` is a Quotation ORM instance with `.customer` and `.lines`
    (each line with `.product`) already loaded. `signer` is an optional
    (name, signature_path) tuple -- see api/quotations.py for how it's
    resolved from the quotation's creator."""
    customer = quotation.customer
    party_lines = [f"<b>{customer.name}</b>" if customer else "<b>Customer</b>"]
    if customer:
        if customer.billing_address:
            party_lines.append(customer.billing_address)
        if customer.city or customer.country:
            party_lines.append(", ".join(filter(None, [customer.city, customer.country])))
        if customer.email:
            party_lines.append(customer.email)
        if customer.phone:
            party_lines.append(customer.phone)

    meta_lines = [
        f"Quotation Date: {_fmt_date(quotation.quotation_date)}",
        f"Valid Until: {_fmt_date(quotation.valid_until)}",
        f"Status: {quotation.status.upper()}",
    ]

    rows = []
    for idx, line in enumerate(quotation.lines, start=1):
        product = line.product
        rows.append(
            [
                str(idx),
                f"{product.code} - {product.name}" if product else str(line.product_id),
                f"{float(line.quantity):g}",
                product.unit if product else "",
                _fmt_money(line.unit_price),
                _fmt_money(line.line_total),
            ]
        )

    signer_name, signature_path = signer or (None, None)
    return _render_document(
        doc_label="QUOTATION",
        doc_number=quotation.quotation_number,
        company_settings=company_settings,
        party_lines=party_lines,
        meta_lines=meta_lines,
        table_header=["#", "Product", "Qty", "Unit", "Unit Price", "Line Total"],
        rows=rows,
        col_widths=[8 * mm, 75 * mm, 18 * mm, 18 * mm, 27 * mm, 28 * mm],
        total_label="Total",
        total_value=_fmt_money(quotation.total_amount),
        notes=quotation.notes,
        footer_note="This is a system-generated quotation and is valid until the date shown above.",
        signer_name=signer_name,
        signature_path=signature_path,
    )


def generate_order_pdf(order, company_settings: dict | None = None, signer=None) -> bytes:
    """`order` is an Order ORM instance with `.customer` and `.lines`
    (each line with `.product`) already loaded."""
    customer = order.customer
    party_lines = [f"<b>{customer.name}</b>" if customer else "<b>Customer</b>"]
    if customer:
        if customer.billing_address:
            party_lines.append(customer.billing_address)
        if customer.city or customer.country:
            party_lines.append(", ".join(filter(None, [customer.city, customer.country])))
        if customer.email:
            party_lines.append(customer.email)
        if customer.phone:
            party_lines.append(customer.phone)

    meta_lines = [
        f"Order Date: {_fmt_date(order.order_date)}",
        f"Requested Delivery: {_fmt_date(order.requested_delivery_date)}",
        f"Status: {order.status.upper().replace('_', ' ')}",
    ]

    rows = []
    for idx, line in enumerate(order.lines, start=1):
        product = line.product
        rows.append(
            [
                str(idx),
                f"{product.code} - {product.name}" if product else str(line.product_id),
                f"{float(line.quantity):g}",
                product.unit if product else "",
                _fmt_money(line.unit_price),
                _fmt_money(line.line_total),
            ]
        )

    signer_name, signature_path = signer or (None, None)
    return _render_document(
        doc_label="SALES ORDER",
        doc_number=order.order_number,
        company_settings=company_settings,
        party_lines=party_lines,
        meta_lines=meta_lines,
        table_header=["#", "Product", "Qty", "Unit", "Unit Price", "Line Total"],
        rows=rows,
        col_widths=[8 * mm, 75 * mm, 18 * mm, 18 * mm, 27 * mm, 28 * mm],
        total_label="Total",
        total_value=_fmt_money(order.total_amount),
        notes=order.notes,
        footer_note="This is a system-generated order confirmation.",
        signer_name=signer_name,
        signature_path=signature_path,
    )


def generate_purchase_order_pdf(po, company_settings: dict | None = None, signer=None) -> bytes:
    """`po` is a PurchaseOrder ORM instance with `.supplier` and `.lines`
    (each line with `.raw_material`) already loaded."""
    supplier = po.supplier
    party_lines = [f"<b>{supplier.name}</b>" if supplier else "<b>Supplier</b>"]
    if supplier:
        if supplier.address:
            party_lines.append(supplier.address)
        if supplier.city or supplier.country:
            party_lines.append(", ".join(filter(None, [supplier.city, supplier.country])))
        if supplier.email:
            party_lines.append(supplier.email)
        if supplier.phone:
            party_lines.append(supplier.phone)

    meta_lines = [
        f"Order Date: {_fmt_date(po.order_date)}",
        f"Expected Delivery: {_fmt_date(po.expected_delivery_date)}",
        f"Status: {po.status.upper().replace('_', ' ')}",
    ]

    rows = []
    for idx, line in enumerate(po.lines, start=1):
        material = line.raw_material
        rows.append(
            [
                str(idx),
                f"{material.code} - {material.name}" if material else str(line.raw_material_id),
                f"{float(line.quantity):g}",
                material.unit if material else "",
                _fmt_money(line.unit_price),
                _fmt_money(line.line_total),
            ]
        )

    signer_name, signature_path = signer or (None, None)
    return _render_document(
        doc_label="PURCHASE ORDER",
        doc_number=po.po_number,
        company_settings=company_settings,
        party_lines=party_lines,
        meta_lines=meta_lines,
        table_header=["#", "Material", "Qty", "Unit", "Unit Price", "Line Total"],
        rows=rows,
        col_widths=[8 * mm, 75 * mm, 18 * mm, 18 * mm, 27 * mm, 28 * mm],
        total_label="Total",
        total_value=_fmt_money(po.total_amount),
        notes=po.notes,
        footer_note="This is a system-generated purchase order.",
        signer_name=signer_name,
        signature_path=signature_path,
    )


def generate_delivery_note_pdf(note, company_settings: dict | None = None, signer=None) -> bytes:
    """`note` is a DeliveryNote ORM instance with `.order` (and its
    `.customer`) and `.lines` (each line with `.product`) already loaded.
    Unlike the other three documents, a delivery note has no monetary
    total -- it's proof of what physically left the warehouse, not an
    invoice."""
    order = note.order
    customer = order.customer if order else None
    party_lines = [f"<b>{customer.name}</b>" if customer else "<b>Customer</b>"]
    if customer:
        if customer.shipping_address or customer.billing_address:
            party_lines.append(customer.shipping_address or customer.billing_address)
        if customer.city or customer.country:
            party_lines.append(", ".join(filter(None, [customer.city, customer.country])))
        if customer.phone:
            party_lines.append(customer.phone)

    meta_lines = [
        f"Delivery Date: {_fmt_date(note.delivery_date)}",
        f"Against Order: {order.order_number if order else '-'}",
        f"Status: {note.status.upper()}",
    ]

    rows = []
    for idx, line in enumerate(note.lines, start=1):
        product = line.product
        rows.append(
            [
                str(idx),
                f"{product.code} - {product.name}" if product else str(line.product_id),
                f"{float(line.quantity_delivered):g}",
                product.unit if product else "",
            ]
        )

    signer_name, signature_path = signer or (None, None)
    return _render_document(
        doc_label="DELIVERY NOTE",
        doc_number=note.delivery_note_number,
        company_settings=company_settings,
        party_lines=party_lines,
        meta_lines=meta_lines,
        table_header=["#", "Product", "Qty Delivered", "Unit"],
        rows=rows,
        col_widths=[10 * mm, 100 * mm, 30 * mm, 34 * mm],
        total_label=None,
        total_value=None,
        notes=note.notes,
        footer_note="This delivery note confirms goods received in good condition by the customer's representative.",
        signer_name=signer_name,
        signature_path=signature_path,
    )
