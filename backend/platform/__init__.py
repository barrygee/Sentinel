"""Cross-section application plumbing that is not itself a domain.

`backend/platform/` holds infrastructure every section (air/space/sea/land/
sdr) and the core app depend on but none of them own: the event bus (`bus.py`,
carried between services over NATS), the service SDK every section runs on
(`sdk/`), the settings client, internal credentials and TLS.
"""
