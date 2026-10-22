"""Radio hub: the IQ providers (rtl_tcp and SDR Manager hosts' relays), decode bridges and their routes.

Moved, not rewritten, out of the SDR section (plan §3.4): everything that touches
a physical radio lives here so Air, Sea and Land can use radios without the SDR
section, and so the hub can run as its own service. Managing the SDR hosts
those radios come from is sdr-manager-remote's (ADR 0007).
"""
