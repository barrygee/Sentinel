# Trunking channel maps

System-specific trunking CSVs live here. This directory is mounted into the
decoder container at `/app/channel-maps` (read-only — dsd-fme reads them via `-C`
channel map and `-G` group list) and into the app container (writable — the
in-app editor renders CSVs here). You select a file in the SDR UI's **TRUNK**
control.

**The recommended way to add a channel map is the in-app JSON editor:**
**Settings → SDR → Trunk Channel Maps (JSON)** (see the main
[`README.md`](../../README.md#trunk-tracking--channel-maps-dmr)). You edit the
channels as `{lsn, frequency_hz}` JSON; the backend stores it in the database and
**writes the `<name>.csv` files in this directory for you**. On first load (before
anything is saved) any channel-map CSVs already here are imported into the editor,
so hand-made files are picked up and not lost.

You can still drop CSVs here by hand if you prefer — the format is below. Channel
maps describe a **specific** trunked system. P25 can self-derive channels from
the control channel (no map needed), but DMR Tier III / Capacity-Plus /
Connect-Plus and EDACS require one.

Only plain `*.csv` filenames are accepted (no sub-paths) — the name is validated
on both the backend and the decoder before it is handed to dsd-fme.

## Channel map (`-C`)

Maps a logical channel/slot number to an RF frequency in Hz. **Keep the header
line** — dsd-fme skips the first line on import, so deleting it drops your first
channel. Example (Capacity-Plus, verbatim format from dsd-fme's examples):

```csv
LSN(dec),frequency(Hz) (do not delete this line or won't import properly)
1,858606250
2,858606250
3,859606250
4,859606250
```

## Group list (`-G`, optional)

Names talkgroups and sets per-group allow/block/encrypted handling. Optional, and
shared across systems. **Keep the header line.** Example (verbatim format):

```csv
DEC,Mode(A- Allow; B - Block; DE - Digital Enc),Name of Group,Tag (do not delete this line or won't import properly)
1449,A,Fire Dispatch,Fire
929,A,Fire Tac,Fire
22033,DE,Law Dispatch,Law
```

`Mode` is `A` (allow/follow), `B` (block — don't tune), or `DE` (digital
encrypted — flagged, not decodable without the key).

The exact column layout varies by protocol; see dsd-fme's
[`examples/`](https://github.com/lwvmobile/dsd-fme/tree/audio_work/examples) for
per-protocol templates (`capacity_plus_chan.csv`, `connect_plus_chan.csv`,
`dmr_t3_chan.csv`, `edacs_channel_map.csv`, `nxdn_chan_map.csv`, …).
