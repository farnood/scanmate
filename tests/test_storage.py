from datetime import datetime

from scanmate.models import Destination
from scanmate.storage import render_filename, safe_slug


def test_safe_slug_removes_unsafe_characters():
    assert safe_slug(" Receipts / 2026! ") == "receipts_2026"


def test_render_filename_uses_template_tokens():
    destination = Destination(id="receipts", name="Paperless Receipts", path="/consume/receipts")

    filename = render_filename(
        "{date}_{time}_{destination}_{scan_type}_{counter}_{custom_prefix}",
        scan_type="Receipt Scan",
        destination=destination,
        counter=7,
        custom_prefix="HP Desk",
        extension="pdf",
        now=datetime(2026, 5, 12, 9, 4, 5),
    )

    assert filename == "2026-05-12_090405_paperless_receipts_receipt_scan_007_hp_desk.pdf"
