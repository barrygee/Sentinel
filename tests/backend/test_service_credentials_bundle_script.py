"""Moving a second host's credentials (backend/scripts/service_credentials_bundle.py, P7.5).

The bundle carries secrets between hosts, so both directions are pinned:
export writes only the named folders and never core's own identity; import
writes only known folders and file names, whatever the tar claims.
"""

import io
import json
import runpy
import stat
import sys
import tarfile
from pathlib import Path

import pytest

from backend.scripts import generate_service_credentials as setup
from backend.scripts import service_credentials_bundle as bundle
from backend.scripts.service_credentials_bundle import BundleError, export_bundle, import_bundle, resolve_folders


@pytest.fixture(scope="module")
def core_credentials(tmp_path_factory) -> Path:
    """A core host's credentials volume, with a radio host named."""
    output = tmp_path_factory.mktemp("core")
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("SENTINEL_RADIO_HOST_HOSTNAMES", "radio.lan")
        setup.generate(output)
    return output


def _export(credentials: Path, names: list[str]) -> bytes:
    buffer = io.BytesIO()
    export_bundle(credentials, names, buffer)
    return buffer.getvalue()


def _members(data: bytes) -> list[str]:
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        return archive.getnames()


def _tar(entries: list[tuple[str, bytes | None, bytes]]) -> io.BytesIO:
    """A gzipped tar from (name, content or None for a symlink, tar type)."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for name, content, kind in entries:
            info = tarfile.TarInfo(name)
            info.type = kind
            if kind == tarfile.SYMTYPE:
                info.linkname = "/etc/passwd"
                archive.addfile(info)
            elif kind == tarfile.DIRTYPE:
                archive.addfile(info)
            else:
                info.size = len(content or b"")
                archive.addfile(info, io.BytesIO(content or b""))
    buffer.seek(0)
    return buffer


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


class TestResolveFolders:
    def test_the_radio_host_group_is_the_hub_every_decoder_and_its_gateway(self):
        assert resolve_folders(["radio-host"]) == [
            "radio-hub", "voice-decoder", "aprs-decoder", "ais-decoder", "stub-decoder", "radio-host-gateway",
        ]  # fmt: skip

    def test_names_and_groups_combine_without_duplicates(self):
        assert resolve_folders(["sdr", "radio-hub", "radio-host"])[:3] == ["sdr", "radio-hub", "voice-decoder"]
        assert resolve_folders(["sdr", "radio-hub", "radio-host"]).count("radio-hub") == 1

    @pytest.mark.parametrize("name", ["core", "gateway"])
    def test_core_identity_is_refused(self, name):
        with pytest.raises(BundleError, match="stays on the core host"):
            resolve_folders([name])

    @pytest.mark.parametrize("name", ["weather", "../core", "certificate-authority", "server"])
    def test_an_unknown_name_is_refused(self, name):
        with pytest.raises(BundleError, match="unknown caller"):
            resolve_folders([name])

    def test_nothing_named_is_refused(self):
        with pytest.raises(BundleError, match="name the callers"):
            resolve_folders([])


class TestExport:
    def test_writes_exactly_the_radio_host_files(self, core_credentials):
        members = _members(_export(core_credentials, ["radio-host"]))
        assert "services/radio-hub/http-credentials.json" in members
        assert "services/radio-hub/nats-credentials.json" in members
        assert "services/radio-hub/accepted-callers.json" in members
        assert "services/radio-host-gateway/private-key.pem" in members
        assert "services/aprs-decoder/http-credentials.json" in members
        assert all(member.startswith("services/") and member.count("/") == 2 for member in members)

    def test_never_carries_core_the_ca_key_or_the_broker(self, core_credentials):
        members = _members(_export(core_credentials, ["radio-host"]))
        assert not any(member.split("/")[1] in ("core", "gateway") for member in members)
        assert not any("certificate-authority/" in member or member.startswith("server/") for member in members)

    def test_a_single_caller(self, core_credentials):
        assert sorted(_members(_export(core_credentials, ["space"]))) == [
            "services/space/certificate-authority.pem",
            "services/space/http-credentials.json",
            "services/space/nats-credentials.json",
        ]

    def test_skips_files_it_does_not_know(self, core_credentials, tmp_path):
        stray = core_credentials / "services" / "space" / "notes.txt"
        stray.write_text("not a credential")
        try:
            assert "services/space/notes.txt" not in _members(_export(core_credentials, ["space"]))
        finally:
            stray.unlink()

    def test_a_radio_host_never_named_has_no_gateway_certificate_to_export(self, tmp_path):
        setup.generate(tmp_path)
        with pytest.raises(BundleError, match="SENTINEL_RADIO_HOST_HOSTNAMES"):
            _export(tmp_path, ["radio-host"])

    def test_a_missing_caller_folder_is_refused_before_anything_is_written(self, tmp_path):
        (tmp_path / "services").mkdir()
        output = io.BytesIO()
        with pytest.raises(BundleError, match="no credentials for 'space'"):
            export_bundle(tmp_path, ["space"], output)
        assert output.getvalue() == b""


class TestImport:
    def test_round_trip_keeps_contents_and_sets_modes(self, core_credentials, tmp_path):
        folders = import_bundle(io.BytesIO(_export(core_credentials, ["radio-host"])), tmp_path)
        assert folders == resolve_folders(["radio-host"])
        services = tmp_path / "services"
        for path in (core_credentials / "services" / "radio-hub").iterdir():
            assert (services / "radio-hub" / path.name).read_bytes() == path.read_bytes()
        assert _mode(services / "radio-hub" / "http-credentials.json") == 0o600
        assert _mode(services / "radio-hub" / "nats-credentials.json") == 0o600
        assert _mode(services / "radio-host-gateway" / "private-key.pem") == 0o600
        assert _mode(services / "radio-hub" / "certificate-authority.pem") == 0o644
        assert _mode(services / "radio-host-gateway" / "certificate.pem") == 0o644
        # Decoders run as their own image's user.
        assert _mode(services / "aprs-decoder" / "http-credentials.json") == 0o644

    def test_reimporting_replaces_the_files(self, core_credentials, tmp_path):
        data = _export(core_credentials, ["space"])
        import_bundle(io.BytesIO(data), tmp_path)
        target = tmp_path / "services" / "space" / "http-credentials.json"
        target.write_text(json.dumps({"caller": "space", "token": "stale"}))
        import_bundle(io.BytesIO(data), tmp_path)
        assert json.loads(target.read_text())["token"] != "stale"

    @pytest.mark.parametrize(
        "name",
        [
            "../escape.json",
            "/etc/passwd",
            "services/core/http-credentials.json",
            "services/gateway/private-key.pem",
            "services/radio-hub/../../escape.json",
            "services/radio-hub/notes.txt",
            "services/radio-hub",
            "server/nats.conf",
            "certificate-authority/private-key.pem",
            "services/radio-hub/sub/http-credentials.json",
        ],
    )
    def test_refuses_an_entry_outside_the_known_layout(self, tmp_path, name):
        hostile = _tar([("services/space/http-credentials.json", b"{}", tarfile.REGTYPE), (name, b"x", tarfile.REGTYPE)])
        with pytest.raises(BundleError, match="refusing unexpected bundle entry"):
            import_bundle(hostile, tmp_path)
        # Checked before writing anything: not even the good entry lands.
        assert not (tmp_path / "services").exists()

    @pytest.mark.parametrize("kind", [tarfile.SYMTYPE, tarfile.DIRTYPE])
    def test_refuses_anything_but_regular_files(self, tmp_path, kind):
        hostile = _tar([("services/radio-hub/http-credentials.json", None, kind)])
        with pytest.raises(BundleError, match="refusing unexpected bundle entry"):
            import_bundle(hostile, tmp_path)

    @pytest.mark.parametrize("data", [b"", b"not a tarball", b"\x1f\x8b broken gzip"])
    def test_refuses_something_that_is_not_a_bundle(self, tmp_path, data):
        with pytest.raises(BundleError, match="not a credentials bundle"):
            import_bundle(io.BytesIO(data), tmp_path)


class TestCommandLine:
    def test_export_writes_the_bundle_to_stdout(self, core_credentials, monkeypatch, capsysbinary):
        monkeypatch.setattr(bundle, "DEFAULT_OUTPUT_DIRECTORY", core_credentials)
        assert bundle.main(["export", "space"]) == 0
        captured = capsysbinary.readouterr()
        assert "services/space/http-credentials.json" in _members(captured.out)
        assert b"exported space" in captured.err

    def test_import_reads_stdin_into_the_directory_given(self, core_credentials, monkeypatch, tmp_path, capsys):
        data = _export(core_credentials, ["space"])
        monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(data)))
        assert bundle.main(["import", str(tmp_path)]) == 0
        assert (tmp_path / "services" / "space" / "http-credentials.json").exists()
        assert "imported space" in capsys.readouterr().err

    def test_import_defaults_to_the_credentials_volume(self, core_credentials, monkeypatch, tmp_path):
        monkeypatch.setattr(bundle, "DEFAULT_OUTPUT_DIRECTORY", tmp_path)
        monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(_export(core_credentials, ["land"]))))
        assert bundle.main(["import"]) == 0
        assert (tmp_path / "services" / "land" / "http-credentials.json").exists()

    def test_a_refused_bundle_is_exit_1_with_the_reason(self, capsys):
        assert bundle.main(["export", "core"]) == 1
        assert "stays on the core host" in capsys.readouterr().err

    @pytest.mark.parametrize("arguments", [[], ["frobnicate"], ["import", "a", "b"]])
    def test_bad_usage_is_exit_2(self, arguments, capsys):
        assert bundle.main(arguments) == 2
        assert "usage:" in capsys.readouterr().err

    def test_runs_as_a_module(self, monkeypatch, capsys):
        monkeypatch.setattr(sys, "argv", ["service_credentials_bundle", "export", "core"])
        monkeypatch.delitem(sys.modules, "backend.scripts.service_credentials_bundle", raising=False)
        with pytest.raises(SystemExit) as exited:
            runpy.run_module("backend.scripts.service_credentials_bundle", run_name="__main__")
        assert exited.value.code == 1
