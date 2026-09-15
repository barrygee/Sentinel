"""Land live feeds — traffic cameras, traffic data and public webcams.

Polls a small set of configured upstream sources (Durham County Council
cameras, TfL JamCams, and a generic single-JPEG "snapshot" provider) on a
background schedule and normalises them into GeoJSON the Land map can render.
See ``docs/plans/land-live-feeds.md`` and the P0 contract for the design.
"""
