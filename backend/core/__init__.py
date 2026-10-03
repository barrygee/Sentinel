"""Core app modules — what stays in the always-on `app` container.

Everything here is section-agnostic: sections (air/space/sea/land/sdr) and the
radio hub may import from `backend.core`, but nothing in `backend.core` may
import a section. The import-linter contracts in `backend/pyproject.toml`
enforce that boundary.
"""
