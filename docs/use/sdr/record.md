# Record

Record what you hear as WAV, and optionally the raw signal (IQ) to re-tune later.

## Features

- **WAV** of exactly what you heard, about 100 KB a second. Only the parts with the squelch open are kept.
- **Raw IQ** (`.u8`): the whole band the radio received, for SDR++, GQRX, Universal Radio Hacker or GNU Radio. About 4 MB a second.
- **RECORDINGS** tab: play, **Download WAV**, **DOWNLOAD IQ**, add a note, filter by **NOTES · MODE**, delete.
- **Satellite passes** record themselves from Space ([how](../space.md#catch-and-record-a-pass)).
- **Safety stop**: a recording left running past **Max Recording Length** is stopped and marked failed.
- **Folders**: sort new recordings into a subfolder, such as `satellites/noaa`.

## Record

1. Tune and press **Tune** (▶).
2. **Record** (●). The button shows ■ while recording, and a pause sign while the squelch is closed.
3. **Stop recording**.

## Where files go

Each recording is `<id>.wav` (and `<id>.u8`) in one folder.

- **Root**: the `sdr_recordings` Docker volume, or a folder on your computer set in `.env`:

  ```bash
  SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings
  docker compose up -d sdr
  ```

  On Linux also set `SENTINEL_RUNTIME_USER_ID` / `_GROUP_ID` to your ids so the files are yours.
- **Folder**: **Recordings Folder** picks a subfolder inside the root. It must stay inside it.

Changing either affects new recordings only; old ones stay where they are.

## Settings

All in **Settings › SDR › SDR Options**.

| Setting | What it does |
|---|---|
| **Record Raw IQ with Recordings (Large Files)** | Also save raw IQ. Off by default |
| **Max Recording Length (Minutes)** | Safety stop. Default 360 |
| **Recordings Folder** | Subfolder for new recordings |

> [!WARNING]
> Raw IQ is about 250 MB a minute. Turn it on only when you need it.

## If it's not working

- **Record greyed out:** nothing is playing. Press **Tune** first.
- **Stuck on COPYING IQ…:** the radio hub is down; it retries every minute. `docker compose ps radio`.
- **Recording missing:** the root moved. Copy old files across, keeping their subfolders.
- **Marked failed:** it ran past **Max Recording Length**, usually after the browser closed.
