"""Standalone entry points: each section as its own service (section-containers plan, P6).

One module per extracted section, each exposing an ASGI `app` built with
`backend.platform.sdk.create_service` from the same routers and services the
monolith hosts in-process. Run one with e.g.
`uvicorn backend.standalone.space:app`; docker compose does, under the
section's profile.
"""
