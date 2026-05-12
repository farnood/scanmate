from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageStat

from .models import EnhancementProfile


def apply_enhancement(source: Path, target: Path, profile: EnhancementProfile) -> None:
    with Image.open(source) as image:
        img = ImageOps.exif_transpose(image)
        if not profile.preserve_color:
            img = img.convert("L")
            img = ImageOps.autocontrast(img)
            if profile.remove_noise:
                img = img.filter(ImageFilter.MedianFilter(size=3))
            if profile.sharpen_text:
                img = img.filter(ImageFilter.SHARPEN)
            if profile.id == "high_contrast_bw":
                img = img.point(lambda value: 255 if value > 170 else 0, mode="1")
        else:
            img = img.convert("RGB")
            img = ImageOps.autocontrast(img)
            if profile.sharpen_text:
                img = ImageEnhance.Sharpness(img).enhance(1.2)
        target.parent.mkdir(parents=True, exist_ok=True)
        img.save(target)


def make_preview(source: Path, target: Path) -> None:
    with Image.open(source) as image:
        img = ImageOps.exif_transpose(image).convert("RGB")
        img.thumbnail((1400, 1400))
        target.parent.mkdir(parents=True, exist_ok=True)
        img.save(target, "JPEG", quality=82, optimize=True)


def classify_scan(source: Path) -> str:
    with Image.open(source) as image:
        img = ImageOps.exif_transpose(image).convert("RGB")
        width, height = img.size
        long_side = max(width, height)
        short_side = max(1, min(width, height))
        aspect = long_side / short_side

        small = img.resize((max(1, width // 12), max(1, height // 12)))
        stat = ImageStat.Stat(small)
        channel_spread = max(stat.stddev) if stat.stddev else 0
        gray = small.convert("L")
        edges = gray.filter(ImageFilter.FIND_EDGES)
        edge_mean = ImageStat.Stat(edges).mean[0]

        if aspect >= 2.2:
            return "receipt"
        if 1.45 <= aspect <= 1.9 and edge_mean < 24:
            return "id_card"
        if channel_spread > 45 and edge_mean < 38:
            return "photo"
        if 1.25 <= aspect <= 1.35:
            return "letter"
        if edge_mean >= 24:
            return "document"
        return "unknown"
