"""The manifests the monolith registers for itself (backend/modules/)."""

from backend.config import settings
from backend.core.service_registry import ServiceRegistry, registry
from backend.main import app  # noqa: F401 — importing the app registers the manifests
from backend.modules import MANIFESTS
from backend.modules.manifest import MONOLITH_VERSION, SECTION_EXPOSES, section_manifest
from backend.platform.service_manifest import route_is_reserved


def test_the_monolith_hosts_every_section_and_the_radio_hub():
    assert [manifest.id for manifest in MANIFESTS] == ["air", "space", "sea", "land", "sdr", "radio-hub"]


def test_sections_are_in_the_shell_registration_order():
    """Nav order is the shell's registration order (platform/web/config/federation.ts)."""
    sections = [manifest for manifest in MANIFESTS if manifest.kind == "section"]

    ordered = sorted(sections, key=lambda manifest: manifest.nav_order)

    assert [manifest.id for manifest in ordered] == ["air", "space", "sea", "land", "sdr"]


def test_every_manifest_points_at_this_process():
    assert {manifest.internal_url for manifest in MANIFESTS} == {settings.core_internal_url}
    assert {manifest.version for manifest in MANIFESTS} == {MONOLITH_VERSION}


def test_each_section_has_a_remote_and_the_radio_hub_has_none():
    for manifest in MANIFESTS:
        if manifest.kind == "section":
            assert manifest.ui is not None
            assert manifest.ui.remote_entry == f"/remotes/{manifest.id}/remoteEntry.js"
        else:
            assert manifest.ui is None


def test_the_manifests_register_together_without_a_conflict():
    ServiceRegistry().register_in_process(list(MANIFESTS), instance_id="core")


def test_the_radio_hub_prefixes_all_sit_inside_the_sdr_section():
    hub = next(manifest for manifest in MANIFESTS if manifest.id == "radio-hub")

    for route in hub.routes:
        assert route.startswith(("/api/sdr/", "/ws/sdr/")), route


def test_every_api_route_is_claimed_by_some_manifest():
    """The gateway (P5.3) routes by these prefixes — an unclaimed path would 404."""
    claimed = [route for manifest in MANIFESTS for route in manifest.routes]
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith(("/api/", "/ws/")) or route_is_reserved(path):
            continue
        assert any(path == prefix.rstrip("/") or path.startswith(prefix.rstrip("/") + "/") for prefix in claimed), path


def test_the_app_registers_them_in_process_at_import():
    for manifest in MANIFESTS:
        registration = registry.get(manifest.id)
        assert registration is not None
        assert registration.in_process is True
        assert registration.manifest is manifest


def test_section_manifest_builds_a_section_served_here():
    manifest = section_manifest("weather", display_name="WX", nav_order=60, routes=["/api/weather/"])

    assert manifest.kind == "section"
    assert manifest.display_name == "WX"
    assert manifest.nav_order == 60
    assert manifest.ui.exposes == SECTION_EXPOSES
