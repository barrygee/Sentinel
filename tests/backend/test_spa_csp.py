"""The shell document's Content-Security-Policy (backend/core/spa_csp.py, served by backend/main.py)."""

import base64
import hashlib
import os

import pytest

from backend.core import spa_csp
from backend.core.spa_csp import content_security_policy, policy_for_index


def expected_hash(source: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(source.encode()).digest()).decode() + "'"


def directive(policy: str, name: str) -> str:
    (match,) = [part.strip() for part in policy.split(";") if part.strip().startswith(name + " ")]
    return match


class TestContentSecurityPolicy:
    def test_allows_each_inline_script_by_the_hash_of_its_exact_text(self):
        boot = "\n  document.documentElement.dataset.theme = 'dark'\n"
        audio = "window._early = 1"
        html = f"<head><script>{boot}</script><script type='text/javascript'>{audio}</script></head>"

        script_src = directive(content_security_policy(html), "script-src")

        assert expected_hash(boot) in script_src
        assert expected_hash(audio) in script_src

    def test_does_not_hash_scripts_loaded_by_src(self):
        html = '<script type="module" crossorigin src="/spa-assets/entry.js"></script>'

        assert "sha256-" not in content_security_policy(html)

    def test_matches_script_tags_in_any_case(self):
        html = "<SCRIPT>run()</SCRIPT >"

        assert expected_hash("run()") in directive(content_security_policy(html), "script-src")

    def test_never_allows_unsafe_inline(self):
        policy = content_security_policy("<script>a()</script>")

        assert "'unsafe-inline'" not in policy

    def test_sets_the_script_directives_and_nothing_else(self):
        policy = content_security_policy("")

        assert directive(policy, "script-src") == "script-src 'self' blob: 'unsafe-eval'"
        assert directive(policy, "worker-src") == "worker-src 'self' blob:"
        assert directive(policy, "object-src") == "object-src 'none'"
        assert directive(policy, "base-uri") == "base-uri 'self'"
        assert [part.split()[0] for part in policy.split("; ")] == ["script-src", "worker-src", "object-src", "base-uri"]


class TestPolicyForIndex:
    def test_follows_a_rebuilt_index(self, tmp_path):
        index = tmp_path / "index.html"
        index.write_text("<script>one()</script>")
        before = policy_for_index(index)

        index.write_text("<script>two()</script>")
        # A rebuild in the same timestamp tick must still be seen.
        stat = index.stat()
        os.utime(index, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))

        after = policy_for_index(index)
        assert expected_hash("one()") in before and expected_hash("one()") not in after
        assert expected_hash("two()") in after

    def test_reads_an_unchanged_index_once(self, tmp_path, monkeypatch):
        index = tmp_path / "index.html"
        index.write_text("<script>same()</script>")
        reads: list[str] = []
        real = spa_csp.content_security_policy

        def counting(html: str) -> str:
            reads.append(html)
            return real(html)

        monkeypatch.setattr(spa_csp, "content_security_policy", counting)
        spa_csp._policy_for.cache_clear()

        assert policy_for_index(index) == policy_for_index(index)
        assert len(reads) == 1


class TestServedShell:
    @pytest.mark.parametrize("path", ["/", "/sea/", "/sdr/some/deep/link"])
    def test_every_spa_route_carries_the_policy_for_the_committed_index(self, client, path):
        from backend.main import SPA_DIR

        response = client.get(path)

        assert response.status_code == 200
        assert response.headers["content-security-policy"] == content_security_policy(
            (SPA_DIR / "index.html").read_text(encoding="utf-8")
        )

    def test_the_committed_index_has_its_boot_scripts_hashed(self, client):
        policy = client.get("/").headers["content-security-policy"]

        # index.html ships two inline boot scripts (map palette, early AudioContext).
        assert directive(policy, "script-src").count("'sha256-") == 2

    def test_api_responses_carry_no_policy(self, client):
        assert "content-security-policy" not in client.get("/health").headers
