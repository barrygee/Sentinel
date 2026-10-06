"""Air section: no lifecycle (everything it does is request-driven), just its manifest."""

from backend.modules.manifest import section_manifest

# `/api/air/messages` stays core's (notifications); the gateway sends that
# longer prefix to core and the rest of `/api/air/` here.
manifest = section_manifest("air", display_name="AIR", nav_order=10, routes=["/api/air/"])
