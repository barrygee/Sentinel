"""Cross-section application plumbing that is not itself a domain.

`backend/platform/` holds infrastructure every section (air/space/sea/land/
sdr) and the core app depend on but none of them own — starting with the
in-process event bus in `bus.py`. As the monolith splits into containers
(see the P1 decoupling plan), this is the package whose contents get
replaced by out-of-process equivalents (e.g. NATS) without the call sites
needing to change shape.
"""
