"""Core's uvicorn entry point: `uvicorn backend.main:app`.

The app itself is composed by `create_core_app()` (`backend/composition_root.py`);
each service running in its own container has its own entry point in its
package (`sentinel_<id>.service`, `sentinel_radio.service`).
"""

import logging

# Before anything logs, so import-time messages use the same format.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from backend.composition_root import create_core_app

app = create_core_app()
