"""Tests for backend/services/app_config_file.py — the live sentinel_config.json.

Covers both directions of the sync (store → file on any settings commit, file →
store on an outside edit), the cases that must NOT act (Sentinel's own writes,
formatting-only edits, broken or invalid files), the start/stop lifecycle, the
background loop, and the SQLAlchemy commit hook that triggers exports.

The service opens sessions from backend.database.AsyncSessionLocal and writes
to settings.app_config_path, so each test points both at per-test resources.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as db
from backend.config import resolved_app_config_path, settings
from backend.models import SdrSearchRange, UserSettings
from backend.services import app_config_file
from backend.services.app_config_file import (
    FILE_COMMENT,
    AppConfigFileSync,
    render_config_file,
)


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(db, "AsyncSessionLocal", factory)
    return factory


@pytest.fixture()
def config_path(tmp_path: Path, monkeypatch) -> Path:
    path = tmp_path / "sentinel_config.json"
    monkeypatch.setattr(settings, "app_config_path", str(path))
    return path


@pytest.fixture()
async def sync(session_factory, config_path):
    service = AppConfigFileSync()
    yield service
    await service.stop()


async def _add(factory, rows: list[tuple[str, str, object]]) -> None:
    async with factory() as session:
        for namespace, key, value in rows:
            session.add(
                UserSettings(
                    namespace=namespace, key=key, value=json.dumps(value), updated_at=1
                )
            )
        await session.commit()


async def _value(factory, namespace: str, key: str) -> object:
    async with factory() as session:
        row = (
            await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace, UserSettings.key == key
                )
            )
        ).scalar_one_or_none()
        return None if row is None else json.loads(row.value)


def _edit(path: Path, document: dict) -> None:
    """Save the file the way an operator's editor would (different formatting)."""
    path.write_text(json.dumps(document, indent=4), encoding="utf-8")


def _file(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class TestPaths:
    def test_a_relative_path_resolves_against_the_repo_root(self, monkeypatch):
        monkeypatch.setattr(settings, "app_config_path", "backend/data/x.json")
        resolved = resolved_app_config_path()
        assert resolved.is_absolute()
        assert resolved.parts[-3:] == ("backend", "data", "x.json")

    def test_an_absolute_path_is_used_as_is(self, monkeypatch, tmp_path: Path):
        monkeypatch.setattr(settings, "app_config_path", str(tmp_path / "c.json"))
        assert resolved_app_config_path() == tmp_path / "c.json"

    def test_the_service_path_follows_the_setting(self, config_path):
        assert AppConfigFileSync().path == config_path


def test_the_file_leads_with_a_comment_then_the_settings():
    text = render_config_file({"app": {"notificationSound": True}})
    assert text.endswith("\n")
    document = json.loads(text)
    assert list(document) == ["_comment", "app"]
    assert document["_comment"] == FILE_COMMENT


class TestExport:
    async def test_writes_every_setting_with_the_comment(
        self, sync, session_factory, config_path
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        assert await sync.export_now() is True
        assert _file(config_path) == {
            "_comment": FILE_COMMENT,
            "app": {"notificationSound": True},
        }

    async def test_does_not_rewrite_a_file_that_already_matches(
        self, sync, session_factory, config_path, monkeypatch
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        await sync.export_now()
        writes: list[object] = []
        monkeypatch.setattr(
            app_config_file,
            "write_json_file",
            lambda *args: writes.append(args) or True,
        )
        assert await sync.export_now() is True
        assert writes == []

    async def test_reports_a_write_that_failed(
        self, sync, session_factory, config_path, monkeypatch
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        monkeypatch.setattr(app_config_file, "write_json_file", lambda *args: False)
        assert await sync.export_now() is False
        assert not config_path.exists()

    async def test_its_own_write_is_not_mistaken_for_an_outside_edit(
        self, sync, session_factory
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        await sync.export_now()
        assert await sync.import_file_if_changed() is False
        assert sync.external_edit_at == 0


class TestImport:
    async def test_does_nothing_when_there_is_no_file(self, sync):
        assert await sync.import_file_if_changed() is False

    async def test_applies_an_outside_edit_and_stamps_it(
        self, sync, session_factory, config_path
    ):
        await _add(session_factory, [("app", "notificationSound", False)])
        await sync.export_now()
        _edit(config_path, {"app": {"notificationSound": True}})

        assert await sync.import_file_if_changed() is True
        assert await _value(session_factory, "app", "notificationSound") is True
        assert sync.external_edit_at > 0

    async def test_does_not_re_read_a_file_whose_size_and_time_are_unchanged(
        self, sync, session_factory, config_path
    ):
        _edit(config_path, {"app": {"notificationSound": True}})
        assert await sync.import_file_if_changed() is True
        stamp = sync.external_edit_at
        assert await sync.import_file_if_changed() is False
        assert sync.external_edit_at == stamp

    async def test_a_formatting_only_edit_is_not_a_settings_change(
        self, sync, session_factory, config_path
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        _edit(config_path, {"_comment": "mine", "app": {"notificationSound": True}})
        assert await sync.import_file_if_changed() is False
        assert sync.external_edit_at == 0

    async def test_ignores_a_file_that_is_not_json_and_logs_it_once(
        self, sync, session_factory, config_path, caplog
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        config_path.write_text('{"app": {"notificationSound": false', encoding="utf-8")
        with caplog.at_level(logging.WARNING, logger=app_config_file.__name__):
            assert await sync.import_file_if_changed() is False
            # Touch the file (new mtime) without changing its content.
            config_path.write_text(
                '{"app": {"notificationSound": false', encoding="utf-8"
            )
            sync._last_seen_stat = None
            assert await sync.import_file_if_changed() is False
        assert await _value(session_factory, "app", "notificationSound") is True
        assert (
            len(
                [
                    record
                    for record in caplog.records
                    if "not valid JSON" in record.message
                ]
            )
            == 1
        )

    async def test_ignores_a_file_whose_top_level_is_not_an_object(
        self, sync, config_path, caplog
    ):
        config_path.write_text("[1, 2]", encoding="utf-8")
        with caplog.at_level(logging.WARNING, logger=app_config_file.__name__):
            assert await sync.import_file_if_changed() is False
        assert "must be a JSON object" in caplog.text

    async def test_ignores_an_invalid_value_and_changes_nothing(
        self, sync, session_factory, config_path, caplog
    ):
        await _add(session_factory, [("app", "notificationSound", False)])
        _edit(
            config_path,
            {
                "app": {
                    "notificationSound": True,
                    "location": {"latitude": 999, "longitude": 0},
                }
            },
        )
        with caplog.at_level(logging.WARNING, logger=app_config_file.__name__):
            assert await sync.import_file_if_changed() is False
        assert await _value(session_factory, "app", "notificationSound") is False
        assert "latitude out of range" in caplog.text
        assert sync.external_edit_at == 0

    async def test_a_fixed_file_is_applied_after_a_rejected_one(
        self, sync, session_factory, config_path
    ):
        config_path.write_text("{broken", encoding="utf-8")
        await sync.import_file_if_changed()
        _edit(config_path, {"app": {"notificationSound": True}})
        assert await sync.import_file_if_changed() is True
        assert await _value(session_factory, "app", "notificationSound") is True

    async def test_asks_for_the_file_to_be_rewritten_in_full_after_an_edit(
        self, sync, session_factory, config_path
    ):
        await _add(
            session_factory,
            [("app", "notificationSound", False), ("sdr", "enabled", True)],
        )
        await sync.start()
        # The operator deleted a whole namespace and changed a value.
        _edit(config_path, {"app": {"notificationSound": True}})
        await sync.import_file_if_changed()
        assert sync._export_requested is not None and sync._export_requested.is_set()
        await sync.export_now()
        assert _file(config_path)["sdr"] == {"enabled": True}


class TestLifecycle:
    async def test_start_creates_the_file_from_the_store(
        self, sync, session_factory, config_path
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        await sync.start()
        assert sync.is_running is True
        assert _file(config_path)["app"] == {"notificationSound": True}

    async def test_start_applies_an_edit_made_while_stopped(
        self, sync, session_factory, config_path
    ):
        await _add(session_factory, [("app", "notificationSound", False)])
        _edit(config_path, {"app": {"notificationSound": True}})
        await sync.start()
        assert await _value(session_factory, "app", "notificationSound") is True
        assert sync.external_edit_at > 0

    async def test_starting_twice_keeps_one_task(self, sync):
        await sync.start()
        task = sync._task
        await sync.start()
        assert sync._task is task

    async def test_stop_flushes_a_pending_export(
        self, sync, session_factory, config_path
    ):
        await sync.start()
        await _add(session_factory, [("app", "notificationSound", True)])
        sync.request_export()
        await sync.stop()
        assert sync.is_running is False
        assert _file(config_path)["app"] == {"notificationSound": True}

    async def test_stop_before_start_is_a_no_op(self, sync):
        await sync.stop()
        assert sync.is_running is False

    def test_request_export_before_start_is_a_no_op(self):
        AppConfigFileSync().request_export()


class TestBackgroundLoop:
    @pytest.fixture(autouse=True)
    def fast_timings(self, monkeypatch):
        monkeypatch.setattr(app_config_file, "FILE_POLL_INTERVAL_S", 0.02)
        monkeypatch.setattr(app_config_file, "EXPORT_DEBOUNCE_S", 0.01)

    async def _eventually(self, predicate) -> None:
        for _ in range(200):
            if predicate():
                return
            await asyncio.sleep(0.01)
        raise AssertionError("condition not met")

    async def test_exports_after_a_request(self, sync, session_factory, config_path):
        await sync.start()
        await _add(session_factory, [("app", "notificationSound", True)])
        sync.request_export()
        await self._eventually(
            lambda: _file(config_path).get("app") == {"notificationSound": True}
        )

    async def test_picks_up_an_outside_edit_on_its_own(
        self, sync, session_factory, config_path
    ):
        await sync.start()
        _edit(config_path, {"app": {"notificationSound": True}})
        await self._eventually(lambda: sync.external_edit_at > 0)
        assert await _value(session_factory, "app", "notificationSound") is True

    async def test_keeps_running_after_a_failed_pass(
        self, sync, session_factory, config_path, monkeypatch, caplog
    ):
        await sync.start()
        failures = {"left": 1}
        real_import = sync.import_file_if_changed

        async def flaky_import():
            if failures["left"]:
                failures["left"] -= 1
                raise RuntimeError("disk hiccup")
            return await real_import()

        monkeypatch.setattr(sync, "import_file_if_changed", flaky_import)
        with caplog.at_level(logging.ERROR, logger=app_config_file.__name__):
            await self._eventually(lambda: failures["left"] == 0)
            _edit(config_path, {"app": {"notificationSound": True}})
            await self._eventually(lambda: sync.external_edit_at > 0)
        assert "retrying on the next poll" in caplog.text


class TestCommitHook:
    """Any committed change to user_settings asks the live sync for an export."""

    @pytest.fixture()
    def export_requests(self, monkeypatch) -> list[int]:
        requests: list[int] = []

        class RecordingSync:
            def request_export(self) -> None:
                requests.append(1)

        monkeypatch.setattr(app_config_file, "sync", RecordingSync())
        return requests

    async def test_an_added_setting_requests_an_export(
        self, session_factory, export_requests
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        assert export_requests == [1]

    async def test_a_bulk_delete_requests_an_export(
        self, session_factory, export_requests
    ):
        await _add(session_factory, [("app", "notificationSound", True)])
        export_requests.clear()
        async with session_factory() as session:
            await session.execute(
                delete(UserSettings).where(UserSettings.key == "notificationSound")
            )
            await session.commit()
        assert export_requests == [1]

    async def test_a_change_to_another_table_does_not(
        self, session_factory, export_requests
    ):
        async with session_factory() as session:
            session.add(
                SdrSearchRange(
                    label="Air",
                    low_hz=118_000_000,
                    high_hz=137_000_000,
                    step_hz=25_000,
                    mode="AM",
                    created_at=1,
                )
            )
            await session.commit()
            await session.execute(delete(SdrSearchRange))
            await session.commit()
        assert export_requests == []

    async def test_a_rolled_back_change_does_not(
        self, session_factory, export_requests
    ):
        async with session_factory() as session:
            session.add(
                UserSettings(
                    namespace="app", key="notificationSound", value="true", updated_at=1
                )
            )
            await session.flush()
            await session.rollback()
            await session.commit()
        assert export_requests == []
