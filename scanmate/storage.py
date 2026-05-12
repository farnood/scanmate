from __future__ import annotations

import os
import re
import uuid
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps

from .models import Destination

SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")
REPEATED_SEPARATOR_RE = re.compile(r"_+")


def safe_slug(value: str) -> str:
    value = value.strip().lower().replace(" ", "_")
    value = SAFE_NAME_RE.sub("_", value)
    value = REPEATED_SEPARATOR_RE.sub("_", value)
    return value.strip("._-") or "scan"


def render_filename(
    template: str,
    *,
    scan_type: str,
    destination: Destination,
    counter: int,
    custom_prefix: str = "",
    extension: str,
    now: datetime | None = None,
) -> str:
    current = now or datetime.now()
    has_custom_prefix_token = "{custom_prefix}" in template
    values = {
        "date": current.strftime("%Y-%m-%d"),
        "time": current.strftime("%H%M%S"),
        "scan_type": safe_slug(scan_type),
        "destination": safe_slug(destination.name),
        "counter": f"{counter:03d}",
        "custom_prefix": safe_slug(custom_prefix) if custom_prefix else "",
    }
    name = template.format(**values)
    name = safe_slug(name)
    if custom_prefix and not has_custom_prefix_token:
        name = f"{safe_slug(custom_prefix)}_{name}"
    return f"{name}.{extension}"


def next_available_path(folder: Path, filename: str) -> Path:
    candidate = folder / filename
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    for index in range(2, 10000):
        next_candidate = folder / f"{stem}_{index}{suffix}"
        if not next_candidate.exists():
            return next_candidate
    raise RuntimeError(f"Cannot find available filename for {filename}")


def atomic_write_image(source: Path, target: Path, *, jpeg_quality: int = 88) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    with Image.open(source) as image:
        img = ImageOps.exif_transpose(image).convert("RGB")
        img.save(tmp, "JPEG", quality=jpeg_quality, optimize=True)
    os.replace(tmp, target)


def atomic_write_pdf(sources: list[Path], target: Path) -> None:
    if not sources:
        raise ValueError("Cannot save an empty PDF.")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    images: list[Image.Image] = []
    try:
        for source in sources:
            opened = Image.open(source)
            images.append(ImageOps.exif_transpose(opened).convert("RGB"))
        first, rest = images[0], images[1:]
        first.save(tmp, "PDF", save_all=True, append_images=rest, resolution=100.0)
        os.replace(tmp, target)
    finally:
        for image in images:
            image.close()
        tmp.unlink(missing_ok=True)
