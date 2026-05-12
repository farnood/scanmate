from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import data_dir


def batches_dir() -> Path:
    root = data_dir() / "batches"
    root.mkdir(parents=True, exist_ok=True)
    return root


def new_batch() -> dict[str, Any]:
    batch_id = uuid.uuid4().hex
    batch = {
        "id": batch_id,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "pages": [],
    }
    save_batch(batch)
    return batch


def batch_dir(batch_id: str) -> Path:
    return batches_dir() / batch_id


def batch_meta_path(batch_id: str) -> Path:
    return batch_dir(batch_id) / "batch.json"


def get_batch(batch_id: str) -> dict[str, Any]:
    path = batch_meta_path(batch_id)
    if not path.exists():
        raise KeyError(f"Unknown batch: {batch_id}")
    return json.loads(path.read_text())


def save_batch(batch: dict[str, Any]) -> None:
    path = batch_meta_path(batch["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(batch, indent=2))
    tmp.replace(path)


def add_page(batch_id: str, image_path: Path, preview_path: Path, detected_type: str) -> dict[str, Any]:
    batch = get_batch(batch_id)
    page = {
        "id": uuid.uuid4().hex,
        "image_path": str(image_path),
        "preview_path": str(preview_path),
        "detected_type": detected_type,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    batch["pages"].append(page)
    save_batch(batch)
    return page


def move_page(batch_id: str, page_id: str, index: int) -> dict[str, Any]:
    batch = get_batch(batch_id)
    pages = batch["pages"]
    current = next((idx for idx, page in enumerate(pages) if page["id"] == page_id), None)
    if current is None:
        raise KeyError(f"Unknown page: {page_id}")
    page = pages.pop(current)
    pages.insert(min(index, len(pages)), page)
    save_batch(batch)
    return batch


def delete_page(batch_id: str, page_id: str) -> dict[str, Any]:
    batch = get_batch(batch_id)
    kept = []
    removed = None
    for page in batch["pages"]:
        if page["id"] == page_id:
            removed = page
        else:
            kept.append(page)
    if removed is None:
        raise KeyError(f"Unknown page: {page_id}")
    for key in ("image_path", "preview_path"):
        Path(removed[key]).unlink(missing_ok=True)
    batch["pages"] = kept
    save_batch(batch)
    return batch


def delete_batch(batch_id: str) -> None:
    shutil.rmtree(batch_dir(batch_id), ignore_errors=True)
