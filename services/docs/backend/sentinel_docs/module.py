"""The docs service's manifest: it owns `/api/documentation/` and has no lifecycle of its own."""

from backend.config import settings
from backend.modules.manifest import SENTINEL_VERSION
from backend.platform.service_manifest import ServiceManifest

# No UI remote: the docs page is the shell's (`frontend/vue/src/docs/`), which
# fetches what it renders from here. Core lists whether a docs service is
# registered (`GET /api/app/docs`) so the shell knows whether to offer Docs.
manifest = ServiceManifest(
    id="docs",
    kind="docs",
    version=SENTINEL_VERSION,
    displayName="DOCS",
    internalUrl=settings.core_internal_url,
    routes=["/api/documentation/"],
)
