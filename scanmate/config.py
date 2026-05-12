from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import ValidationError

from .defaults import DEFAULT_ENHANCEMENTS, DEFAULT_PRESETS
from .models import AppConfig, Destination


def config_dir() -> Path:
    return Path(os.getenv("SCANMATE_CONFIG_DIR", "~/.config/scanmate")).expanduser()


def data_dir() -> Path:
    return Path(os.getenv("SCANMATE_DATA_DIR", "~/.local/share/scanmate")).expanduser()


def config_path() -> Path:
    return config_dir() / "config.json"


def default_config() -> AppConfig:
    default_destination = os.getenv("SCANMATE_DEFAULT_DESTINATION", "/data/paperless/consume/general")
    return AppConfig(
        default_destination_id="general",
        destinations=[
            Destination(id="general", name="General documents", path=default_destination),
            Destination(id="receipts", name="Receipts", path="/data/paperless/consume/receipts"),
            Destination(id="invoices", name="Invoices", path="/data/paperless/consume/invoices"),
            Destination(id="personal", name="Personal documents", path="/data/paperless/consume/personal"),
            Destination(id="warranty", name="Warranty documents", path="/data/paperless/consume/warranty"),
            Destination(id="photos", name="Photos", path="/data/scans/photos", paperless_consume=False),
        ],
        presets=DEFAULT_PRESETS,
        enhancements=DEFAULT_ENHANCEMENTS,
    )


def load_config() -> AppConfig:
    path = config_path()
    if not path.exists():
        cfg = default_config()
        save_config(cfg)
        return cfg
    try:
        return AppConfig.model_validate_json(path.read_text())
    except (json.JSONDecodeError, ValidationError) as exc:
        raise RuntimeError(f"Invalid ScanMate config at {path}: {exc}") from exc


def save_config(config: AppConfig) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(config.model_dump_json(indent=2))
    tmp.replace(path)


def get_destination(config: AppConfig, destination_id: str) -> Destination:
    for destination in config.destinations:
        if destination.id == destination_id:
            return destination
    raise KeyError(f"Unknown destination: {destination_id}")


def get_preset(config: AppConfig, preset_id: str):
    for preset in config.presets:
        if preset.id == preset_id:
            return preset
    raise KeyError(f"Unknown scan preset: {preset_id}")


def get_enhancement(config: AppConfig, enhancement_id: str):
    for profile in config.enhancements:
        if profile.id == enhancement_id:
            return profile
    raise KeyError(f"Unknown enhancement profile: {enhancement_id}")
