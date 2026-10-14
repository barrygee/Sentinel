"""Radio hub: the IQ providers (rtl_tcp, Sentry), decode bridges and their routes.

Moved, not rewritten, out of the SDR section (plan §3.4): everything that touches
a physical radio lives here so Air, Sea and Land can use radios without the SDR
section, and so the hub can later run as its own service.
"""
