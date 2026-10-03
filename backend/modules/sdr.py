"""SDR section lifecycle: seed stored frequencies and the band plan from their data files."""

from backend.database import seed_sdr_bandplan_from_file, seed_sdr_data_from_files
from backend.platform.lifecycle import ModuleLifecycle


async def _prepare() -> None:
    await seed_sdr_data_from_files()
    await seed_sdr_bandplan_from_file()


lifecycle = ModuleLifecycle(name="sdr", prepare=_prepare)
