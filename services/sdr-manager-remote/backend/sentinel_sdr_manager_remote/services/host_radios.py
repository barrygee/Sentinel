"""The radios a Sentinel host's SDRs became, and forgetting them with the host.

ADD on a host's SDR (or ADD SDRS: AUTOMATICALLY) writes a radio into
`sdr.radios` linked to the host by `sdr_manager_host_id`. Deleting the host
must take those radios with it: left behind, they show under UNLISTED SENTINEL
HOST, can't connect (their host is gone) and still offer themselves to every
radio picker. Radios added by IP and port at the host's address carry no host
id, so they are the operator's own and stay.

`sdr.radios` is a core setting, so it is read and written through the settings
client, as `host_poller` does (never the row directly): over HTTP to core in
the service, whatever session it is handed; on that session in-process.
"""

from __future__ import annotations

from backend.platform.settings_client import read_setting, write_setting
from sqlalchemy.ext.asyncio import AsyncSession


async def forget_host_radios(db: AsyncSession, host_id: int) -> int:
    """Remove every radio made from `host_id`'s SDRs from `sdr.radios`.

    Returns:
        How many radios were removed (nothing is written when none were).

    Raises:
        SettingsUnavailable: core's settings couldn't be read or written; the
            radios are then untouched, so the caller can refuse the delete.
    """
    radios = await read_setting(db, "sdr", "radios", default=[])
    if not isinstance(radios, list):
        return 0
    kept = [radio for radio in radios if not (isinstance(radio, dict) and radio.get("sdr_manager_host_id") == host_id)]
    removed = len(radios) - len(kept)
    if removed:
        await write_setting(db, "sdr", "radios", kept, raise_errors=True)
    return removed
