from pathlib import Path

from PIL import Image

from scanmate.images import classify_scan, make_preview


def test_make_preview(tmp_path: Path):
    source = tmp_path / "source.png"
    target = tmp_path / "preview.jpg"
    Image.new("RGB", (2400, 3200), "white").save(source)

    make_preview(source, target)

    assert target.exists()
    with Image.open(target) as preview:
        assert max(preview.size) <= 1400


def test_classify_receipt_by_aspect_ratio(tmp_path: Path):
    source = tmp_path / "receipt.png"
    Image.new("RGB", (700, 2400), "white").save(source)

    assert classify_scan(source) == "receipt"
