from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

from .models import ScannerDevice, ScanPreset


class ScannerError(RuntimeError):
    pass


DEVICE_RE = re.compile(r"device `(?P<id>[^`]+)' is a (?P<name>.+)")


def parse_scanimage_devices(output: str) -> list[ScannerDevice]:
    devices: list[ScannerDevice] = []
    for line in output.splitlines():
        match = DEVICE_RE.search(line.strip())
        if not match:
            continue
        device_id = match.group("id")
        backend = device_id.split(":", 1)[0] if ":" in device_id else "sane"
        devices.append(
            ScannerDevice(
                id=device_id,
                name=match.group("name").strip(),
                backend=backend,
                raw=line.strip(),
            )
        )
    return devices


def discover_scanners() -> list[ScannerDevice]:
    if not shutil.which("scanimage"):
        return []
    result = subprocess.run(
        ["scanimage", "-L"],
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    if result.returncode != 0 and not result.stdout:
        raise ScannerError(result.stderr.strip() or "Scanner discovery failed.")
    return parse_scanimage_devices(result.stdout)


def scan_page(scanner_id: str, preset: ScanPreset, output_path: Path) -> None:
    if not shutil.which("scanimage"):
        raise ScannerError("scanimage is not installed. Install SANE packages on the server.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "scanimage",
        "-d",
        scanner_id,
        f"--resolution={preset.dpi}",
        f"--mode={preset.color_mode}",
        "--format=png",
        "-o",
        str(output_path),
    ]

    # Page dimensions are not supported uniformly by every backend. Apply only common fixed sizes.
    if preset.page_size == "A4":
        cmd.extend(["-x", "210", "-y", "297"])
    elif preset.page_size == "Letter":
        cmd.extend(["-x", "216", "-y", "279"])

    result = subprocess.run(cmd, text=True, capture_output=True, timeout=300, check=False)
    if result.returncode != 0:
        output_path.unlink(missing_ok=True)
        message = result.stderr.strip() or result.stdout.strip() or "Scan failed."
        raise ScannerError(message)
    if not output_path.exists() or output_path.stat().st_size == 0:
        output_path.unlink(missing_ok=True)
        raise ScannerError("Scan finished but no image was produced.")
