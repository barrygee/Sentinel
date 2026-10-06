"""SDR section lifecycle: seed stored frequencies and the band plan from their data files."""

from backend.database import seed_sdr_bandplan_from_file, seed_sdr_data_from_files
from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle


async def _prepare() -> None:
    await seed_sdr_data_from_files()
    await seed_sdr_bandplan_from_file()


lifecycle = ModuleLifecycle(name="sdr", prepare=_prepare)

# The rest of `/api/sdr/` (frequencies, groups, search ranges, band plan,
# recordings). The radio hub registers the longer prefixes it owns.
manifest = section_manifest("sdr", display_name="SDR", nav_order=50, routes=["/api/sdr/"])
