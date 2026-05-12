from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import batches
from .config import get_destination, get_enhancement, get_preset, load_config, save_config
from .images import apply_enhancement, classify_scan, make_preview
from .models import ConfigUpdate, MovePageRequest, SaveBatchRequest, ScanRequest
from .scanners import ScannerError, discover_scanners, scan_page
from .storage import atomic_write_image, atomic_write_pdf, next_available_path, render_filename

APP_ROOT = Path(__file__).resolve().parent
STATIC_DIR = APP_ROOT / "static"

app = FastAPI(title="ScanMate", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/config")
def read_config():
    return load_config()


@app.put("/api/config")
def update_config(update: ConfigUpdate):
    config = load_config()
    if update.default_destination_id is not None:
        config.default_destination_id = update.default_destination_id
    if update.destinations is not None:
        config.destinations = update.destinations
    if update.naming is not None:
        config.naming = update.naming
    if update.default_scanner_id is not None:
        config.scanner.default_scanner_id = update.default_scanner_id
    save_config(config)
    return config


@app.get("/api/scanners")
def scanners():
    try:
        devices = discover_scanners()
    except ScannerError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "devices": devices,
        "message": None if devices else "No scanners found. Check SANE/HPLIP/airscan setup on the server.",
    }


@app.post("/api/batches")
def create_batch():
    return batches.new_batch()


@app.get("/api/batches/{batch_id}")
def read_batch(batch_id: str):
    try:
        return public_batch(batches.get_batch(batch_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/scan")
def scan(request: ScanRequest):
    config = load_config()
    try:
        preset = get_preset(config, request.preset_id)
        enhancement = get_enhancement(config, preset.enhancement_profile)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    batch = batches.new_batch() if request.batch_id is None else batches.get_batch(request.batch_id)
    page_id = uuid.uuid4().hex
    root = batches.batch_dir(batch["id"])
    raw_path = root / f"{page_id}_raw.png"
    image_path = root / f"{page_id}.png"
    preview_path = root / f"{page_id}_preview.jpg"

    try:
        scan_page(request.scanner_id, preset, raw_path)
        apply_enhancement(raw_path, image_path, enhancement)
        make_preview(image_path, preview_path)
        detected_type = classify_scan(image_path)
        page = batches.add_page(batch["id"], image_path, preview_path, detected_type)
    except ScannerError as exc:
        raw_path.unlink(missing_ok=True)
        image_path.unlink(missing_ok=True)
        preview_path.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raw_path.unlink(missing_ok=True)
        image_path.unlink(missing_ok=True)
        preview_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Scan processing failed: {exc}") from exc
    finally:
        raw_path.unlink(missing_ok=True)

    return {"batch": public_batch(batches.get_batch(batch["id"])), "page": public_page(page)}


@app.get("/api/previews/{batch_id}/{page_id}.jpg")
def preview(batch_id: str, page_id: str):
    try:
        batch = batches.get_batch(batch_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    for page in batch["pages"]:
        if page["id"] == page_id:
            return FileResponse(page["preview_path"], media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Preview not found.")


@app.post("/api/batches/{batch_id}/pages/{page_id}/move")
def move_page(batch_id: str, page_id: str, request: MovePageRequest):
    try:
        return public_batch(batches.move_page(batch_id, page_id, request.index))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/batches/{batch_id}/pages/{page_id}")
def delete_page(batch_id: str, page_id: str):
    try:
        return public_batch(batches.delete_page(batch_id, page_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/batches/{batch_id}/save")
def save_batch_endpoint(batch_id: str, request: SaveBatchRequest):
    config = load_config()
    try:
        batch = batches.get_batch(batch_id)
        destination = get_destination(config, request.destination_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not batch["pages"]:
        raise HTTPException(status_code=400, detail="Batch has no pages to save.")

    folder = Path(destination.path).expanduser()
    template = request.filename_template or config.naming.template
    saved: list[str] = []
    page_paths = [Path(page["image_path"]) for page in batch["pages"]]

    try:
        if request.output_format == "pdf" and request.save_mode == "single_file":
            filename = render_filename(
                template,
                scan_type=request.scan_type,
                destination=destination,
                counter=1,
                custom_prefix=request.custom_prefix,
                extension="pdf",
            )
            target = next_available_path(folder, filename)
            atomic_write_pdf(page_paths, target)
            saved.append(str(target))
        else:
            extension = "jpg" if request.output_format == "jpeg" else "pdf"
            for index, page_path in enumerate(page_paths, start=1):
                filename = render_filename(
                    template,
                    scan_type=request.scan_type,
                    destination=destination,
                    counter=index,
                    custom_prefix=request.custom_prefix,
                    extension=extension,
                )
                target = next_available_path(folder, filename)
                if request.output_format == "jpeg":
                    atomic_write_image(page_path, target)
                else:
                    atomic_write_pdf([page_path], target)
                saved.append(str(target))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save scan: {exc}") from exc

    return {"saved_files": saved, "destination": destination}


def public_page(page: dict):
    return {
        "id": page["id"],
        "preview_url": page["preview_path"] and f"/api/previews/{Path(page['preview_path']).parent.name}/{page['id']}.jpg",
        "detected_type": page.get("detected_type", "unknown"),
        "created_at": page.get("created_at"),
    }


def public_batch(batch: dict):
    return {
        "id": batch["id"],
        "created_at": batch["created_at"],
        "pages": [public_page(page) for page in batch["pages"]],
    }
