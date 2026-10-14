"""Core's uvicorn entry point: `uvicorn backend.main:app`.

The app is core only (`create_core_app()`, `backend/core/app.py`); each section
and the radio hub has its own entry point in its package
(`sentinel_<id>.service`, `sentinel_radio.service`), and `docker compose up`
runs them all behind the gateway.
"""

import logging

# Before anything logs, so import-time messages use the same format.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from backend.core.app import create_core_app

app = create_core_app()
