# ScanMate

ScanMate is a local-first home scan station for Paperless-ngx consume folders. It runs as a small web app on a home server, discovers scanners through SANE, stages scanned pages for preview, and saves PDF or JPEG files into local or mounted destination folders.

## MVP features

- Scanner discovery with `scanimage -L`.
- Manual scanner selection.
- Home scan presets: document, receipt, photo, ID/card, letter, archive, quick, and custom.
- Destination configuration for Paperless consume folders or any local/mounted path.
- Batch foundation: scan pages one by one, preview, reorder, delete, then save.
- PDF output as one multipage PDF or separate PDF files.
- JPEG output as separate files.
- Smart filename templates with date, time, scan type, destination, counter, and custom prefix tokens.
- Local JSON configuration and local-only processing.

## Scanner setup

ScanMate uses SANE through the `scanimage` command. On Debian/Ubuntu hosts:

```bash
sudo apt update
sudo apt install sane-utils libsane1 sane-airscan hplip
scanimage -L
```

Recommended scanner paths:

- Modern network scanners: install `sane-airscan` for eSCL/AirScan and WSD support.
- HP scanners: install `hplip`; many HP devices appear through the `hpaio` SANE backend, while newer network devices may also appear through `airscan`.
- USB scanners: make sure the server user can access USB scanner devices. Udev rules from distro packages usually handle this, but Docker deployments may need `/dev/bus/usb` mounted.

If `scanimage -L` does not show the scanner, ScanMate will not be able to use it yet. Fix SANE/HPLIP/airscan discovery first, then refresh the scanner list in the UI.

## Run locally

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
scanmate
```

Open `http://localhost:8765`. On your LAN, open `http://SERVER_IP:8765`.

Useful environment variables:

```bash
SCANMATE_CONFIG_DIR=./config
SCANMATE_DATA_DIR=./data
SCANMATE_DEFAULT_DESTINATION=/srv/paperless/consume/general
```

The first run creates `config.json` in `SCANMATE_CONFIG_DIR`. You can edit it directly and restart the app.

## Docker

Start from the example:

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose up --build
```

For network scanners, `network_mode: host` helps mDNS/WSD/eSCL discovery. For USB scanners, keep the `/dev/bus/usb` mount and make sure the host permissions allow access.

Mount Paperless consume folders into the container and configure destinations to those mounted paths, for example:

```yaml
volumes:
  - /srv/paperless/consume:/paperless/consume
```

Then set destination paths such as `/paperless/consume/receipts`.

## Filename templates

Default:

```text
{date}_{scan_type}_{counter}
```

Supported tokens:

- `{date}`: `YYYY-MM-DD`
- `{time}`: `HHMMSS`
- `{scan_type}`: selected preset id/name
- `{destination}`: destination name
- `{counter}`: page/file counter like `001`
- `{custom_prefix}`: optional prefix from save request

Examples:

- `2026-05-12_receipt_001.pdf`
- `2026-05-12_document_001.pdf`
- `2026-05-12_photo_001.jpg`

## Paperless-ngx

This MVP does not require the Paperless API. Configure destinations to folders that Paperless watches as consume folders. ScanMate writes files atomically: it creates a temporary file in the destination folder and renames it into place after the file has been fully written.

## Privacy

- No cloud services.
- No external uploads.
- Scans are staged and processed locally.
- Destination paths are local or OS-mounted folders.

For LAN exposure, put ScanMate behind your home reverse proxy and add authentication there, or keep it reachable only on a trusted network.

## Development

```bash
pip install -e ".[dev]"
pytest
```

The current scanner adapter is intentionally small. Future adapters can be added around the same batch and save pipeline.
