"""The Content-Security-Policy the shell document is served with (section-containers plan §4.5).

Section remotes are code the shell runs, so the policy pins where scripts may
come from: this origin (the gateway serves every remote under `/remotes/<id>/`),
plus exactly the inline scripts `index.html` ships with — allowed by hash, so an
injected one, or an `on…=` attribute, never runs.

Two allowances are there for SDR audio, not by choice:
- `blob:` — the demodulator worklet is loaded from a Blob URL
  (`useSdrAudio.ts`), and MapLibre starts its workers from one;
- `'unsafe-eval'` — on the plain-HTTP LAN address there is no AudioWorklet, and
  the ScriptProcessor fallback evaluates the same demodulator source with
  `new Function`. Without it a LAN browser plays no audio.
Serving the worklet from a same-origin file would let both go.

Only script-related directives are set: styles, images, tiles and connections
are unrestricted, as they are today.

The policy is built from the `index.html` actually on disk, so a rebuilt bundle
with a changed boot script is covered without anyone updating a hash by hand.
"""

from __future__ import annotations

import base64
import hashlib
import re
from functools import lru_cache
from pathlib import Path

# An inline classic or module script: a <script> element with no src attribute.
_INLINE_SCRIPT = re.compile(r"<script(?![^>]*\bsrc\s*=)[^>]*>(.*?)</script\s*>", re.IGNORECASE | re.DOTALL)


def _script_hash(source: str) -> str:
    digest = hashlib.sha256(source.encode("utf-8")).digest()
    return f"'sha256-{base64.b64encode(digest).decode('ascii')}'"


def content_security_policy(index_html: str) -> str:
    """The CSP header value for a shell document with this HTML."""
    inline_hashes = [_script_hash(source) for source in _INLINE_SCRIPT.findall(index_html)]
    script_sources = " ".join(["'self'", "blob:", "'unsafe-eval'", *inline_hashes])
    return "; ".join(
        [
            f"script-src {script_sources}",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
        ]
    )


@lru_cache(maxsize=4)
def _policy_for(index_path: Path, modified_ns: int, size: int) -> str:
    # Keyed on mtime and size so a rebuild is picked up on the next request.
    return content_security_policy(index_path.read_text(encoding="utf-8"))


def policy_for_index(index_path: Path) -> str:
    """The CSP for the `index.html` at `index_path`, recomputed only when the file changes."""
    stat = index_path.stat()
    return _policy_for(index_path, stat.st_mtime_ns, stat.st_size)
