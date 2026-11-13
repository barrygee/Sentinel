"""The gateway's web page over HTTPS (`gateway/caddy.json`, server `sentinel_https`).

A second Caddy server on :8444 with the same routes as the plain one on :8080
(core pushes the registry's routes into both subroutes, backend/core/gateway_sync.py)
and the gateway's certificate. These tests keep the two from drifting: every
route, body limit, compression rule and error page the plain page has, the
encrypted one has, with only the ids that must differ renamed.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from backend.core.gateway_routes import HTTPS_REGISTRY_ROUTES_ID, REGISTRY_ROUTES_ID

CADDY_CONFIG = Path(__file__).resolve().parents[2] / "gateway" / "caddy.json"

# Caddy ids name one object each, so the HTTPS server's copies carry their own.
RENAMED_IDS = {
    REGISTRY_ROUTES_ID: HTTPS_REGISTRY_ROUTES_ID,
    "static_compression": "static_compression_https",
}


def _servers() -> dict[str, Any]:
    return json.loads(CADDY_CONFIG.read_text())["apps"]["http"]["servers"]


def _ids(node: Any) -> list[str]:
    if isinstance(node, dict):
        own = [node["@id"]] if "@id" in node else []
        return own + [found for value in node.values() for found in _ids(value)]
    if isinstance(node, list):
        return [found for value in node for found in _ids(value)]
    return []


def _with_https_ids(node: Any) -> Any:
    renamed = copy.deepcopy(node)

    def rename(item: Any) -> None:
        if isinstance(item, dict):
            if item.get("@id") in RENAMED_IDS:
                item["@id"] = RENAMED_IDS[item["@id"]]
            for value in item.values():
                rename(value)
        elif isinstance(item, list):
            for value in item:
                rename(value)

    rename(renamed)
    return renamed


def test_serves_https_on_8444_with_the_gateways_certificate():
    https = _servers()["sentinel_https"]

    assert https["listen"] == [":8444"]
    assert https["tls_connection_policies"] == [{"default_sni": "gateway"}]
    # h3 would need UDP published as well; h1 and h2 run over the one TCP port.
    assert https["protocols"] == ["h1", "h2"]
    assert https["automatic_https"] == {"disable": True}


def test_has_exactly_the_plain_pages_routes_and_error_pages():
    servers = _servers()

    assert servers["sentinel_https"]["routes"] == _with_https_ids(
        servers["sentinel"]["routes"]
    )
    assert servers["sentinel_https"]["errors"] == servers["sentinel"]["errors"]


def test_holds_the_subroute_core_pushes_the_https_copy_into():
    assert HTTPS_REGISTRY_ROUTES_ID in _ids(_servers()["sentinel_https"])


def test_every_id_in_the_config_is_unique():
    """Caddy refuses a config that reuses an id, so a copied server must rename its own."""
    ids = _ids(json.loads(CADDY_CONFIG.read_text()))

    assert len(ids) == len(set(ids))


def test_the_plain_page_is_unchanged_and_still_unencrypted():
    plain = _servers()["sentinel"]

    assert plain["listen"] == [":8080"]
    assert "tls_connection_policies" not in plain
    assert REGISTRY_ROUTES_ID in _ids(plain)
