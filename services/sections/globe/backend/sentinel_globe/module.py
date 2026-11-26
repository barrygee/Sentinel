"""The Globe section's manifest: the optional 3D globe of live aircraft, satellites, vessels and APRS stations.

It owns `/api/globe/`, where it serves the combined feed it collects from the
other sections over NATS (`GET /api/globe/objects`, ADR 0009). It has no database and no settings of its
own: the `globe.*` settings (on/off switch, chosen satellites, layer toggles)
live in core like every section's.
"""

from backend.modules.manifest import section_manifest

manifest = section_manifest("globe", display_name="GLOBE", nav_order=60, routes=["/api/globe/"])
