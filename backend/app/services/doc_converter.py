"""Converts a rendered .docx (from doc_template_service.render_document)
to PDF bytes, by shelling out to headless LibreOffice (`soffice`).

This is what lets "Print" and "Email" for a document actually use the
admin-uploaded template -- previously they went through pdf_generator.py's
separate, hardcoded ReportLab layout, which had no connection to the
templates managed in Admin -> Documents at all. python-docx/docxtpl can
*write* a .docx, but nothing in the pure-Python stack can faithfully
*render* one to PDF (tables, styles, and Arabic RTL shaping all need a
real layout engine) -- LibreOffice is the standard way to get that
without a Word installation.

Requires the `libreoffice-writer` package (soffice with the Writer
component) on the host -- see install.sh/install.bat and backend/README.md.
"""

import subprocess
import tempfile
import uuid
from pathlib import Path

from app.core.exceptions import AppError

# Generous but bounded: a soffice conversion of a one-page business
# document normally finishes in 1-3 seconds; this is a hard ceiling
# against a hung/wedged soffice process rather than an expected duration.
_CONVERT_TIMEOUT_SECONDS = 45


def convert_docx_to_pdf(docx_bytes: bytes) -> bytes:
    """Renders `docx_bytes` through LibreOffice and returns the resulting
    PDF's bytes. Raises AppError with a clear, user-facing message if
    soffice isn't installed or the conversion otherwise fails -- there's
    no silent fallback, since a fallback here would mean silently NOT
    using the admin's template, which is the entire point of this call.

    Each call gets its own temp working directory and its own LibreOffice
    user profile (`-env:UserInstallation`): soffice keeps a lock file in
    its profile directory, so two conversions sharing one profile at the
    same time fail unpredictably. A fresh profile per call costs a little
    disk churn (cleaned up immediately after) but makes concurrent
    Print/Email requests safe without needing an app-level queue/lock.
    """
    with tempfile.TemporaryDirectory(prefix="docx2pdf-") as workdir_str:
        workdir = Path(workdir_str)
        source_path = workdir / f"{uuid.uuid4().hex}.docx"
        profile_dir = workdir / "lo_profile"
        source_path.write_bytes(docx_bytes)

        try:
            result = subprocess.run(
                [
                    "soffice",
                    "--headless",
                    "--norestore",
                    f"-env:UserInstallation=file://{profile_dir}",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(workdir),
                    str(source_path),
                ],
                capture_output=True,
                timeout=_CONVERT_TIMEOUT_SECONDS,
            )
        except FileNotFoundError as exc:
            raise AppError(
                "PDF generation isn't available on this server: LibreOffice "
                "(soffice) isn't installed. See backend/README.md."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise AppError("PDF generation timed out. Please try again.") from exc

        pdf_path = source_path.with_suffix(".pdf")
        if result.returncode != 0 or not pdf_path.exists():
            detail = (result.stderr or result.stdout or b"").decode("utf-8", errors="replace").strip()
            raise AppError(f"PDF generation failed.{f' ({detail})' if detail else ''}")

        return pdf_path.read_bytes()
