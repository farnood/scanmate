# Security Policy

ScanMate handles personal documents and is private by default.

## Supported versions

The project is currently pre-1.0. Security fixes will target the latest released version.

## Reporting a vulnerability

Please report security issues privately through the repository security advisory feature once the project is published. If that is not available, open an issue that asks for a private contact path without including exploit details.

## Local deployment expectations

- Do not expose ScanMate directly to the public internet.
- Put it behind a trusted reverse proxy with authentication if it is reachable outside a trusted LAN.
- Mount only the folders ScanMate needs to write to.
- Keep Paperless consume folders and ScanMate config directories backed up.
