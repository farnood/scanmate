from scanmate.scanners import parse_scanimage_devices


def test_parse_scanimage_devices():
    output = """
device `airscan:e0:HP OfficeJet Pro 9010 [123ABC]' is a eSCL HP OfficeJet Pro 9010 ip=192.168.1.20
device `hpaio:/net/HP_LaserJet_MFP?ip=192.168.1.30' is a Hewlett-Packard HP_LaserJet_MFP all-in-one
"""

    devices = parse_scanimage_devices(output)

    assert len(devices) == 2
    assert devices[0].id == "airscan:e0:HP OfficeJet Pro 9010 [123ABC]"
    assert devices[0].backend == "airscan"
    assert "OfficeJet" in devices[0].name
    assert devices[1].backend == "hpaio"


def test_parse_ignores_no_device_message():
    output = "No scanners were identified. If you were expecting something different..."

    assert parse_scanimage_devices(output) == []
