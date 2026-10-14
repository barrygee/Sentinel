"""Core's own module lifecycles (B8) and the manifest helpers the sections use.

`bus` and `core` are this process itself; `create_core_app()`
(`backend/core/app.py`) runs them as `CORE_LIFECYCLES`, in that order — see
`backend/platform/lifecycle.py` for why the order is load-bearing. Each section
and the radio hub declare their own lifecycle and manifest in their package
(`sentinel_<id>.module`, `sentinel_radio.module`) and run them in their own
service.
"""
