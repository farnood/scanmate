# Contributing to ScanMate

ScanMate is a local-first home scanning app. Contributions should keep the daily household workflow simple while making scanner support and deployment more reliable.

## Development setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
pytest
SCANMATE_CONFIG_DIR=./config SCANMATE_DATA_DIR=./data scanmate
```

Open `http://localhost:8765`.

## Contribution guidelines

- Keep changes small and focused.
- Prefer local-first behavior and avoid cloud dependencies.
- Do not add scanner-vendor assumptions directly to the UI. Put scanner-specific behavior behind backend scanner adapters.
- Preserve atomic file writes for destination folders.
- Add tests for parsing, naming, config behavior, and save logic when those areas change.
- Document any new system package requirements.

## UX principles

- The daily path should stay short: preset, page mode, document type, destination, scan, save.
- Mobile is the primary interface.
- Advanced settings should be available without being in the way.
- Error messages should explain what the household user can do next.
