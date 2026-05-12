"""Characterization tests for the settings router.

Pins the JSON shapes and status codes of every endpoint so the Phase 2B
refactor (db_helpers, error_handlers) cannot silently change the API contract.
"""
from __future__ import annotations

import io
import json


# ── GET /api/settings ─────────────────────────────────────────────────────────

class TestGetAllSettings:
    def test_empty_database_returns_empty_object(self, client):
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        assert resp.json() == {}

    def test_after_put_returns_grouped_namespace(self, client):
        client.put("/api/settings/air/foo", json={"value": "bar"})
        client.put("/api/settings/air/baz", json={"value": 42})
        client.put("/api/settings/space/qux", json={"value": True})

        resp = client.get("/api/settings")
        assert resp.status_code == 200
        assert resp.json() == {
            "air":   {"foo": "bar", "baz": 42},
            "space": {"qux": True},
        }


# ── GET /api/settings/{namespace} ─────────────────────────────────────────────

class TestGetNamespace:
    def test_unknown_namespace_returns_empty_object(self, client):
        resp = client.get("/api/settings/does_not_exist")
        assert resp.status_code == 200
        assert resp.json() == {}

    def test_returns_key_value_map(self, client):
        client.put("/api/settings/air/onlineUrl", json={"value": "https://example.com"})
        client.put("/api/settings/air/offgridUrl", json={"value": ""})

        resp = client.get("/api/settings/air")
        assert resp.status_code == 200
        assert resp.json() == {
            "onlineUrl":  "https://example.com",
            "offgridUrl": "",
        }

    def test_does_not_leak_other_namespaces(self, client):
        client.put("/api/settings/air/a", json={"value": 1})
        client.put("/api/settings/space/b", json={"value": 2})

        air = client.get("/api/settings/air").json()
        assert "a" in air and "b" not in air


# ── PUT /api/settings/{namespace}/{key} ───────────────────────────────────────

class TestUpsertSetting:
    def test_insert_returns_ok(self, client):
        resp = client.put("/api/settings/air/key1", json={"value": "first"})
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_update_overwrites_previous_value(self, client):
        client.put("/api/settings/air/key1", json={"value": "first"})
        client.put("/api/settings/air/key1", json={"value": "second"})
        resp = client.get("/api/settings/air")
        assert resp.json() == {"key1": "second"}

    def test_value_can_be_object(self, client):
        payload = {"nested": {"a": 1, "b": [2, 3]}}
        client.put("/api/settings/space/blob", json={"value": payload})
        assert client.get("/api/settings/space").json() == {"blob": payload}

    def test_value_can_be_list(self, client):
        client.put("/api/settings/air/list", json={"value": [1, 2, 3]})
        assert client.get("/api/settings/air").json() == {"list": [1, 2, 3]}

    def test_value_can_be_boolean(self, client):
        client.put("/api/settings/air/flag", json={"value": True})
        assert client.get("/api/settings/air").json() == {"flag": True}


# ── GET /api/settings/config/preview ──────────────────────────────────────────

class TestConfigPreview:
    def test_returns_json_content_type(self, client):
        resp = client.get("/api/settings/config/preview")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/json")

    def test_empty_database_is_empty_object(self, client):
        resp = client.get("/api/settings/config/preview")
        assert json.loads(resp.content) == {}

    def test_includes_all_namespaces(self, client):
        client.put("/api/settings/air/a", json={"value": 1})
        client.put("/api/settings/space/b", json={"value": 2})
        body = json.loads(client.get("/api/settings/config/preview").content)
        assert body == {"air": {"a": 1}, "space": {"b": 2}}


# ── POST /api/settings/config/upload ──────────────────────────────────────────

class TestConfigUpload:
    def _upload(self, client, payload):
        return client.post(
            "/api/settings/config/upload",
            files={"file": ("config.json", io.BytesIO(json.dumps(payload).encode()), "application/json")},
        )

    def test_returns_status_ok(self, client):
        resp = self._upload(client, {"air": {"key": "value"}})
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_settings_are_persisted_after_upload(self, client):
        self._upload(client, {"air": {"a": 1, "b": 2}, "space": {"c": 3}})
        assert client.get("/api/settings").json() == {"air": {"a": 1, "b": 2}, "space": {"c": 3}}

    def test_invalid_json_returns_400(self, client):
        resp = client.post(
            "/api/settings/config/upload",
            files={"file": ("config.json", io.BytesIO(b"not json"), "application/json")},
        )
        assert resp.status_code == 400

    def test_non_object_root_returns_400(self, client):
        resp = self._upload(client, ["array", "instead", "of", "object"])
        assert resp.status_code == 400

    def test_sdr_radios_get_sequential_ids(self, client):
        payload = {
            "sdr": {
                "radios": [
                    {"name": "a", "host": "h", "port": 1, "enabled": True},
                    {"name": "b", "host": "h", "port": 1, "enabled": True, "id": 5},
                    {"name": "c", "host": "h", "port": 1, "enabled": True},
                ],
            },
        }
        self._upload(client, payload)
        radios = client.get("/api/settings/sdr").json()["radios"]
        ids = [r["id"] for r in radios]
        # `b` already had id=5; `a` and `c` must have integer ids and not collide with each other.
        assert all(isinstance(i, int) for i in ids)
        assert len(set(ids)) == 3
