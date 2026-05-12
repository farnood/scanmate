from fastapi.testclient import TestClient

from scanmate.app import app


def test_config_update_allows_settings_edits(tmp_path, monkeypatch):
    monkeypatch.setenv("SCANMATE_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("SCANMATE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    original = client.get("/api/config").json()
    destination = {
        "id": "family",
        "name": "Family",
        "path": str(tmp_path / "consume" / "family"),
        "description": "Household inbox",
        "paperless_consume": True,
    }
    preset = {
        **original["presets"][0],
        "id": "household",
        "name": "Household",
        "dpi": 300,
    }

    response = client.put(
        "/api/config",
        json={
            "default_destination_id": "family",
            "destinations": [destination],
            "presets": [preset],
            "naming": {"template": "{custom_prefix}_{date}_{scan_type}_{counter}", "custom_prefix": "home"},
            "default_scanner_id": "airscan:e0:Example",
        },
    )

    assert response.status_code == 200
    config = response.json()
    assert config["default_destination_id"] == "family"
    assert config["destinations"] == [destination]
    assert config["presets"][0]["id"] == "household"
    assert config["naming"]["custom_prefix"] == "home"
    assert config["scanner"]["default_scanner_id"] == "airscan:e0:Example"
