from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


OutputFormat = Literal["pdf", "jpeg"]
ColorMode = Literal["Color", "Gray", "Lineart"]


class Destination(BaseModel):
    id: str
    name: str
    path: str
    description: str = ""
    paperless_consume: bool = True


class ScanPreset(BaseModel):
    id: str
    name: str
    description: str = ""
    dpi: int = Field(ge=75, le=2400)
    color_mode: ColorMode = "Gray"
    page_size: str = "Auto"
    output_format: OutputFormat = "pdf"
    compression: Literal["low", "medium", "high"] = "medium"
    enhancement_profile: str = "clean_document"
    multi_page: bool = False


class EnhancementProfile(BaseModel):
    id: str
    name: str
    deskew: bool = False
    crop_edges: bool = False
    remove_noise: bool = False
    sharpen_text: bool = False
    preserve_color: bool = False


class ScannerPreference(BaseModel):
    default_scanner_id: str | None = None


class NamingConfig(BaseModel):
    template: str = "{date}_{scan_type}_{counter}"
    custom_prefix: str = ""


class AppConfig(BaseModel):
    scanner: ScannerPreference = Field(default_factory=ScannerPreference)
    default_destination_id: str = "general"
    destinations: list[Destination]
    presets: list[ScanPreset]
    enhancements: list[EnhancementProfile]
    naming: NamingConfig = Field(default_factory=NamingConfig)


class ScannerDevice(BaseModel):
    id: str
    name: str
    backend: str
    raw: str
    available: bool = True


class ScanRequest(BaseModel):
    scanner_id: str
    preset_id: str = "document"
    batch_id: str | None = None


class SaveBatchRequest(BaseModel):
    destination_id: str
    output_format: OutputFormat = "pdf"
    save_mode: Literal["single_file", "separate_files"] = "single_file"
    scan_type: str = "document"
    filename_template: str | None = None
    custom_prefix: str = ""


class MovePageRequest(BaseModel):
    index: int = Field(ge=0)


class ConfigUpdate(BaseModel):
    default_destination_id: str | None = None
    destinations: list[Destination] | None = None
    presets: list[ScanPreset] | None = None
    enhancements: list[EnhancementProfile] | None = None
    naming: NamingConfig | None = None
    default_scanner_id: str | None = None
