"""`Settings` reads the project's `.env`, which Docker Compose shares (backend/config.py)."""

from backend.config import Settings


def test_compose_only_keys_in_the_env_file_are_ignored(tmp_path, monkeypatch):
    # A real environment variable would win over the file under test.
    monkeypatch.delenv("SENTINEL_EXTERNAL_SERVICES", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "COMPOSE_PROFILES=space,land,air\nSENTINEL_EXTERNAL_SERVICES=space,land\n"
    )

    loaded = Settings(_env_file=env_file)

    assert loaded.sentinel_external_services == "space,land"
    assert not hasattr(loaded, "compose_profiles")
