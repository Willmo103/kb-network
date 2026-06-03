import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from kb_core.config import Config
from kb_network.db import init_db, record_telemetry
from kb_network.server import app


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    test_db = tmp_path / "test_kb.db"
    monkeypatch.setattr(Config, "db_path", test_db)
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def test_db_init():
    db = Config().get_db()
    assert "network_hosts" in db.table_names()
    assert "network_telemetry_history" in db.table_names()
    assert "network_services" in db.table_names()


def test_record_telemetry_db():
    db = Config().get_db()

    mock_data = {
        "hostname": "test-agent",
        "ip_address": "127.0.0.1",
        "mac_address": "00:11:22:33:44:55",
        "user": "test-user",
        "os_name": "Linux",
        "os_version": "Ubuntu",
        "cpu_percent": 25.0,
        "cpu_cores": 2,
        "ram_total": 4000,
        "ram_used": 1000,
        "ram_free": 3000,
        "disks": [{"path": "/", "total": 100, "used": 40, "free": 60, "percent": 40.0}],
        "timestamp": datetime.now().isoformat(),
    }

    record_telemetry(mock_data, api_token="test_token", port=8081)

    hosts = list(db["network_hosts"].rows_where("hostname = ?", ["test-agent"]))
    assert len(hosts) == 1
    assert hosts[0]["status"] == "active"
    assert hosts[0]["api_token"] == "test_token"


def test_list_hosts_endpoint(client):
    db = Config().get_db()
    db["network_hosts"].upsert(
        {
            "hostname": "api-test-host",
            "ip_address": "127.0.0.1",
            "port": 8081,
            "api_token": "token123",
            "status": "active",
        },
        pk="hostname",
    )

    response = client.get("/hosts")
    assert response.status_code == 200
    hosts = response.json().get("hosts", [])
    assert any(h["hostname"] == "api-test-host" for h in hosts)
