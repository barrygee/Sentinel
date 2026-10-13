"""Standalone entry points: each section as its own service (section-containers plan, P6).

One module per extracted section, each exposing an ASGI `app` built with
`backend.platform.sdk.create_service` from the same routers and services the
monolith hosts in-process. Run one with e.g.
`uvicorn backend.standalone.sdr:app`; docker compose does. A section that
has moved into its own package has its entry point there instead
(`uvicorn sentinel_space.service:app`).
"""
