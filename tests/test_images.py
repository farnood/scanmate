from pathlib import Path

from PIL import Image

from scanmate.images import apply_enhancement, classify_scan, make_preview
from scanmate.models import EnhancementProfile


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


def test_color_scan_preserves_color_even_with_document_cleanup(tmp_path: Path):
    source = tmp_path / "color.png"
    target = tmp_path / "enhanced.png"
    image = Image.new("RGB", (20, 20), "red")
    image.paste("blue", (10, 0, 20, 20))
    image.save(source)

    apply_enhancement(
        source,
        target,
        EnhancementProfile(id="clean_document", name="Clean document", remove_noise=True, sharpen_text=True),
        preserve_color=True,
    )

    with Image.open(target) as enhanced:
        assert enhanced.mode == "RGB"
        left = enhanced.getpixel((5, 5))
        right = enhanced.getpixel((15, 5))

    assert left != right
