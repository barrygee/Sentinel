"""Top-level pytest fixtures.

`client` gives every router test a FastAPI TestClient backed by an in-memory
SQLite database. The schema is created from the live ORM models, so any model
change is automatically reflected in tests. Each test gets a fresh database.
"""
from __future__ import annotations

from typing import AsyncGenerator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models  # noqa: F401 — register ORM models with Base
from backend.database import Base, get_db
from backend.main import app


@pytest.fixture()
def test_engine():
    """Per-test in-memory SQLite engine. StaticPool forces every connection to
    share the same underlying in-memory database, otherwise each new connection
    sees an empty schema."""
    return create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


@pytest.fixture()
async def db_setup(test_engine):
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await test_engine.dispose()


@pytest.fixture()
def client(test_engine, db_setup) -> TestClient:
    """FastAPI TestClient with `get_db` overridden to use the in-memory engine."""
    TestSession = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    # NOTE: not using `with TestClient(app)` — that triggers the lifespan
    # context, which kicks off a 24h background cleanup task and creates the
    # real production DB schema. We don't need the lifespan for router tests.
    c = TestClient(app)
    try:
        yield c
    finally:
        c.close()
        app.dependency_overrides.clear()
