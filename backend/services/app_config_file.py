"""Two-way sync between user_settings and the live `sentinel_config.json` file.

The file holds every setting in the application config document (see
`app_config.py`) so it can be read, backed up, or hand-edited on disk:

* **Store → file.** Any committed change to a `user_settings` row — a Settings
  control, an SDR radio edit, a config upload — is noticed by a SQLAlchemy
  commit hook, and the file is rewritten shortly after (debounced, atomic).
* **File → store.** The file is polled; a saved edit is validated and applied
  through the same path as Settings › Application Config's upload, and
  `external_edit_at` is bumped so open browsers know to reload their settings.

Polling (rather than inotify) is deliberate: file events do not cross a Docker
Desktop bind mount, which is exactly where the file is edited from the host.

The store stays authoritative at runtime. A file that fails to parse or
validate is logged and ignored; it is replaced by the store's content on the
next settings change or restart.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from pathlib import Path
from typing import Any

from backend.cache import now_ms
from backend.config import resolved_app_config_path
from backend.models import UserSettings
from backend.services.app_config import InvalidConfigError, apply_config, build_config_snapshot
from backend.services.json_store import write_json_file
from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session

logger = logging.getLogger(__name__)

# How often the file is checked for an outside edit.
FILE_POLL_INTERVAL_S = 1.0
# How long to gather a burst of settings commits into one file write.
EXPORT_DEBOUNCE_S = 0.25

FILE_COMMENT = (
    "Sentinel application config: every setting, kept in sync with the app. It is rewritten "
    "whenever a setting changes; edit and save it to change settings (applied within a couple "
    "of seconds). Secrets (the AIS API key) and the SDR frequency, band-plan and satellite-radio "
    "data files are not included."
)

# Session.info flag set when a flush/statement touched user_settings, consumed on commit.
_SETTINGS_TOUCHED_FLAG = "sentinel_user_settings_touched"


def _without_reserved_keys(document: dict) -> dict:
    """Drop `_`-prefixed entries (e.g. `_comment`) so documents compare on settings alone."""
    return {key: value for key, value in document.items() if not key.startswith("_")}


def render_config_file(snapshot: dict[str, Any]) -> str:
    """Return the exact text the live file holds for a config snapshot."""
    return json.dumps({"_comment": FILE_COMMENT, **snapshot}, indent=2, ensure_ascii=False) + "\n"


class AppConfigFileSync:
    """Owns the live config file: exports store changes to it and imports edits from it."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._export_requested: asyncio.Event | None = None
        # The text Sentinel itself last wrote/accepted, so its own writes are
        # never mistaken for an outside edit.
        self._last_synced_text: str | None = None
        # (mtime_ns, size) of the file when last examined — skips re-reading an unchanged file.
        self._last_seen_stat: tuple[int, int] | None = None
        # Text of an edit already rejected, so a broken file is logged once, not every poll.
        self._last_rejected_text: str | None = None
        self.external_edit_at = 0

    @property
    def path(self) -> Path:
        """Where the live file lives (`APP_CONFIG_PATH`, default backend/data/sentinel_config.json)."""
        return resolved_app_config_path()

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def request_export(self) -> None:
        """Ask for the file to be rewritten from the store (no-op when not running)."""
        if self._export_requested is not None:
            self._export_requested.set()

    async def start(self) -> None:
        """Reconcile file and store once, then keep them in sync in the background.

        A file edited while Sentinel was stopped is applied; a missing file is
        created from the store.
        """
        if self.is_running:
            return
        self._export_requested = asyncio.Event()
        await self.import_file_if_changed()
        await self.export_now()
        self._task = asyncio.create_task(self._run(), name="app-config-file-sync")

    async def stop(self) -> None:
        """Stop syncing, flushing a pending export first so no change is lost."""
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        if self._export_requested is not None and self._export_requested.is_set():
            await self.export_now()
        self._export_requested = None

    async def _run(self) -> None:
        assert self._export_requested is not None
        while True:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._export_requested.wait(), timeout=FILE_POLL_INTERVAL_S)
            try:
                # Always pick up an outside edit before exporting, so a settings
                # change arriving in the same moment can't overwrite it unread.
                await self.import_file_if_changed()
                if self._export_requested.is_set():
                    await asyncio.sleep(EXPORT_DEBOUNCE_S)
                    self._export_requested.clear()
                    await self.export_now()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("app config file sync failed; retrying on the next poll")

    async def export_now(self) -> bool:
        """Write the store's current settings to the file if they differ from it.

        Returns True when the file now matches the store.
        """
        from backend.database import AsyncSessionLocal  # avoid import cycle at module load

        async with AsyncSessionLocal() as session:
            snapshot = await build_config_snapshot(session)
        text = render_config_file(snapshot)
        if self._read_file_text() == text:
            self._remember_synced(text)
            return True
        if not write_json_file(self.path, {"_comment": FILE_COMMENT, **snapshot}):
            return False
        self._remember_synced(text)
        return True

    async def import_file_if_changed(self) -> bool:
        """Apply the file to the store if it was edited outside Sentinel.

        Returns True when an edit was applied. An unparseable or invalid file is
        logged (once per distinct content) and left for the operator to fix.
        """
        stat = self._stat_file()
        if stat is None or stat == self._last_seen_stat:
            return False
        self._last_seen_stat = stat

        text = self._read_file_text()
        if text is None or text == self._last_synced_text or text == self._last_rejected_text:
            return False

        try:
            document = json.loads(text)
        except json.JSONDecodeError as exc:
            self._reject(text, f"not valid JSON ({exc})")
            return False
        if not isinstance(document, dict):
            self._reject(text, "the top level must be a JSON object")
            return False

        from backend.database import AsyncSessionLocal  # avoid import cycle at module load

        async with AsyncSessionLocal() as session:
            # Formatting-only edits (or a file matching the store already) are
            # not settings changes — don't make every browser reload for them.
            if _without_reserved_keys(document) == await build_config_snapshot(session):
                self._remember_synced(text)
                return False
            try:
                await apply_config(session, document)
            except InvalidConfigError as exc:
                await session.rollback()
                self._reject(text, str(exc))
                return False

        logger.info("applied settings edited in %s", self.path)
        self._remember_synced(text)
        self._last_rejected_text = None
        self.external_edit_at = now_ms()
        # Rewrite the file in canonical form: restores deleted keys and ordering.
        self.request_export()
        return True

    def _reject(self, text: str, reason: str) -> None:
        self._last_rejected_text = text
        logger.warning("ignoring edit to %s: %s — settings unchanged", self.path, reason)

    def _remember_synced(self, text: str) -> None:
        self._last_synced_text = text
        self._last_seen_stat = self._stat_file()

    def _stat_file(self) -> tuple[int, int] | None:
        try:
            stat = self.path.stat()
        except OSError:
            return None
        return (stat.st_mtime_ns, stat.st_size)

    def _read_file_text(self) -> str | None:
        try:
            return self.path.read_text(encoding="utf-8")
        except OSError:
            return None


sync = AppConfigFileSync()


# ── Change detection ─────────────────────────────────────────────────────────
# Registered on the Session class so every write path is covered — routers,
# services and startup seeding alike — without each having to remember to ask.


@event.listens_for(Session, "after_flush")
def _flag_flushed_settings(session: Session, _flush_context: Any) -> None:
    touched = (*session.new, *session.dirty, *session.deleted)
    if any(isinstance(instance, UserSettings) for instance in touched):
        session.info[_SETTINGS_TOUCHED_FLAG] = True


@event.listens_for(Session, "do_orm_execute")
def _flag_bulk_settings_statements(execute_state: ORMExecuteState) -> None:
    # Bulk `delete(UserSettings)` / `update(UserSettings)` statements bypass the flush.
    if not (execute_state.is_delete or execute_state.is_update):
        return
    mapper = execute_state.bind_mapper
    if mapper is not None and mapper.class_ is UserSettings:
        execute_state.session.info[_SETTINGS_TOUCHED_FLAG] = True


@event.listens_for(Session, "after_commit")
def _export_after_settings_commit(session: Session) -> None:
    if session.info.pop(_SETTINGS_TOUCHED_FLAG, False):
        sync.request_export()


@event.listens_for(Session, "after_rollback")
def _forget_rolled_back_settings(session: Session) -> None:
    session.info.pop(_SETTINGS_TOUCHED_FLAG, None)
