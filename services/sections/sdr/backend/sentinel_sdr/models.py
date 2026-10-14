"""The SDR section's tables: frequency groups, stored frequencies, their group links, scanner search ranges, recordings.

They live in the SDR service's own database (`sdr.db`). They share core's
declarative `Base`, so the in-process app and the test suite create them with
the rest of the schema once this module is imported. The radios themselves are
not the SDR section's: they are a core setting (`sdr.radios`), and the legacy
`sdr_radios` table they were migrated out of stays in core.
"""

from backend.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, Text


class SdrFrequencyGroup(Base):
    """Named group that organises stored frequencies (e.g. 'Aviation', 'Marine')."""

    __tablename__ = "sdr_frequency_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    slug = Column(Text, nullable=False, default="")  # rename-stable key, e.g. "air-to-air-refueling"
    color = Column(Text, nullable=False, default="#c8ff00")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(Integer, nullable=False)  # Unix ms


class SdrStoredFrequency(Base):
    """An individual saved frequency (bookmark) with tuning parameters."""

    __tablename__ = "sdr_stored_frequencies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, nullable=True)  # FK → sdr_frequency_groups.id (nullable = ungrouped)
    label = Column(Text, nullable=False)  # e.g. "ATIS 118.05"
    frequency_hz = Column(Integer, nullable=False)  # stored as integer Hz e.g. 118050000
    mode = Column(Text, nullable=False, default="AM")  # AM|NFM|WFM|USB|LSB|CW
    squelch = Column(Float, nullable=False, default=-60.0)  # dBFS threshold
    gain = Column(Float, nullable=False, default=30.0)  # dB RF gain; use -1.0 for auto (AGC)
    # Per-frequency tuning settings, applied when the user clicks the frequency
    # or a scan stops on it. bandwidth/sample_rate are nullable so an unset value
    # falls back to the live/per-mode default; the rest carry concrete defaults.
    bandwidth = Column(
        Integer, nullable=True, default=None
    )  # demod (audio filter) bandwidth Hz; None = per-mode default
    sample_rate = Column(Integer, nullable=True, default=None)  # device sample rate Hz; None = keep current
    volume = Column(Integer, nullable=False, default=80)  # audio volume 0-100 (%)
    zoom = Column(Float, nullable=False, default=1.0)  # waterfall zoom factor
    zmin = Column(Float, nullable=False, default=0.0)  # waterfall Min dB (0 = auto/unset)
    zmax = Column(Float, nullable=False, default=0.0)  # waterfall Max dB (0 = auto/unset)
    scannable = Column(Boolean, nullable=False, default=True)
    favourite = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=False, default="")
    created_at = Column(Integer, nullable=False)  # Unix ms


class SdrFrequencyGroupLink(Base):
    """Junction table — many-to-many between stored frequencies and groups."""

    __tablename__ = "sdr_frequency_group_links"

    frequency_id = Column(Integer, primary_key=True)
    group_id = Column(Integer, primary_key=True)


class SdrSearchRange(Base):
    """A named low/high frequency range with a step size, used by the SDR
    Search feature to sweep a band and stop on signals."""

    __tablename__ = "sdr_search_ranges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    label = Column(Text, nullable=False)  # e.g. "Air Band"
    low_hz = Column(Integer, nullable=False)  # inclusive sweep start
    high_hz = Column(Integer, nullable=False)  # inclusive sweep end
    step_hz = Column(Integer, nullable=False, default=12500)  # channel spacing
    mode = Column(Text, nullable=False, default="NFM")  # AM|NFM|WFM|USB|LSB|CW
    threshold_dbfs = Column(Float, nullable=False, default=-35.0)  # stop-on-signal threshold
    dwell_ms = Column(Integer, nullable=False, default=250)  # ms per step
    band_name = Column(Text, nullable=False, default="")  # optional sdr.bandPlan ref
    enabled = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=False, default="")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(Integer, nullable=False)  # Unix ms


class SdrRecording(Base):
    """A recorded audio clip captured from the SDR demodulator."""

    __tablename__ = "sdr_recordings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    notes = Column(Text, nullable=False, default="")
    radio_id = Column(Integer, nullable=True)
    radio_name = Column(Text, nullable=False, default="")
    frequency_hz = Column(Integer, nullable=False)
    mode = Column(Text, nullable=False, default="AM")
    gain_db = Column(Float, nullable=False, default=30.0)
    squelch_dbfs = Column(Float, nullable=False, default=-60.0)
    sample_rate = Column(Integer, nullable=False, default=2048000)
    started_at = Column(Text, nullable=False)  # ISO-8601 UTC e.g. "2026-04-06T12:34:56Z"
    ended_at = Column(Text, nullable=False, default="")
    duration_s = Column(Float, nullable=False, default=0.0)
    file_size_bytes = Column(Integer, nullable=False, default=0)
    has_iq_file = Column(Boolean, nullable=False, default=False)
    iq_file_size_bytes = Column(Integer, nullable=False, default=0)
    status = Column(Text, nullable=False, default="recording")  # "recording"|"complete"|"error"
    created_at = Column(Integer, nullable=False)  # Unix ms
