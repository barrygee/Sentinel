"""Position history shared by the Air, Sea and Land sections (and Space's TLE history).

Each section records the movement it already receives into its own
``<section>_position_history`` table, keeps a rolling window of days, and serves
it back for the map's replay mode. This package holds the pieces every section
shares, so a section only supplies its table, its recording hook and its
sample gate:

- ``schema``    — the column mixin every history table uses
- ``recorder``  — buffered, gated, source-agnostic recording
- ``retention`` — the hourly prune loop
- ``queries``   — bounded reads (samples, coverage, status)
- ``router``    — the three ``/history/*`` endpoints, built per section
"""
