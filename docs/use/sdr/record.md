# Record what you hear

This page shows you how to record from your radio, what the files are, and where they are saved. You need a radio added and playing first; see [Listen to a frequency](listen.md).

## What recordings are for

- **Listen again** to something you half-heard, such as a call sign or a weather report.
- **Keep a log** of a net, a contest or a satellite pass.
- **Decode later.** Open the audio in another program, such as a weather-satellite image decoder.
- **Look again at the whole band.** A raw IQ recording keeps everything the radio received, so you can tune to a different signal in it later.

## Record

1. Tune to the signal you want and select **Tune** (▶).
2. Select **Record** (●). While it records, the button shows a square (■).
3. Select **Stop recording** to finish.

While the squelch is closed, the button shows a pause sign and nothing is recorded, so a recording holds only the parts with a signal.

Space can also record a satellite pass for you; see [Space: Tune and record a pass automatically](../space.md#tune-and-record-a-pass-automatically).

## Play, download and delete

Open the **RECORDINGS** tab in the radio panel. Each recording shows its frequency, mode, length and time. For each one you can:

- **Play** it in the browser;
- **Download WAV**, the audio;
- **DOWNLOAD IQ**, the raw signal, if you recorded it (see below). It reads **COPYING IQ…** for a short while after you stop, until the file is ready;
- add a note, and filter the list by **NOTES · MODE**;
- delete it.

## WAV and raw IQ

Every recording saves a **WAV** file of the audio: exactly what you heard. It plays anywhere and is small, about 100 KB a second.

Turn on **Settings › SDR › SDR Options › Record Raw IQ with Recordings (Large Files)** to save a second file of **raw IQ** as well. IQ is the radio's raw signal: the whole band it was receiving, not only what you were listening to, as unsigned 8-bit pairs straight from the dongle (`.u8`). Open it in SDR software such as SDR++, GQRX, Universal Radio Hacker or GNU Radio to tune to a different signal in the same band, try another mode, or decode it again.

> [!WARNING]
> Raw IQ is large: about 4 MB a second, some 250 MB a minute, at the default 2.048 MHz sample rate. Turn it on only when you need it.

## Where recordings are saved

Both files of a recording are saved together in one folder, named after the recording's number (`<id>.wav` and `<id>.u8`). The frequency, mode, sample rate and notes are kept with the recording in Sentinel, not in the file name.

Two settings decide where that folder is. The **recordings root** is where on disk recordings go; you set it once, in `.env`. The **recordings folder** is how they are sorted inside it; change it in Settings whenever you like.

### The recordings root

By default recordings are kept inside Docker, in the `sdr_recordings` volume. They are safe there across rebuilds and upgrades, but you can only reach them through Sentinel.

To save them to a folder on your computer instead (to open them in other software, keep them on a bigger or external disk, back them up, or share them), set the folder in `.env` and restart the SDR service:

```bash
SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings
docker compose up -d sdr
```

Docker creates the folder if it doesn't exist. The files are ordinary files you can open from Finder or a file manager. On Linux, also set `SENTINEL_RUNTIME_USER_ID` and `SENTINEL_RUNTIME_GROUP_ID` in `.env` to your own ids (`id -u` and `id -g`), so the files belong to you.

### The recordings folder

**Settings › SDR › SDR Options › Recordings Folder** picks a folder inside the root, such as `satellites/noaa`. It is created when the next recording starts. Use it to keep recordings sorted by what you are doing: set `satellites/noaa` before a weather-satellite pass and `airband` afterwards, and each session's files land in their own folder. Leave it empty to save straight into the root.

The folder must stay inside the root, so anyone using Settings can sort recordings but can't make Sentinel write anywhere else on the computer. A full path, `.` or `..`, or a backslash is refused. If one reaches Sentinel another way (a hand-edited config file), the recording goes to the root and the `sdr` log says `Ignoring sdr.recordingsFolder (…); saving to …`.

### Changing either one

Changing the root or the folder affects **new** recordings only. Every recording remembers the folder it was saved in, so older ones still play, download and delete from where they are, and nothing is moved.

- Recordings made before the recordings folder setting existed stay in `recordings/` on the `sdr_data` volume.
- If you point `SENTINEL_RECORDINGS_DIRECTORY` at a different folder later, recordings saved under the old one show as missing until you copy them across, keeping the same subfolders.

## Settings

| Setting | What it does | When to change it |
|---|---|---|
| **Record Raw IQ with Recordings (Large Files)** | Saves a raw IQ file alongside each WAV. Off by default. | When you want to re-tune or decode a recording later. |
| **Max Recording Length (Minutes)** | A recording still running after this long is stopped and marked failed, and its raw IQ is deleted. Default 360 (6 hours). | Raise it if you record for longer. It is there so a recording nobody stopped (a closed tab, a lost connection) can't fill the disk. |
| **Recordings Folder** | The folder inside the recordings root for new recordings. | Whenever you want to sort recordings by job. |

All three are in **Settings › SDR › SDR Options**. The recordings root is `SENTINEL_RECORDINGS_DIRECTORY` in `.env`.

## Troubleshooting

- **Record is greyed out.** Nothing is playing. Select **Tune** first.
- **DOWNLOAD IQ stays at COPYING IQ….** The IQ is copied from the radio hub after you stop. If the hub is down, the copy waits and tries again every minute; check `docker compose ps radio`.
- **A recording shows as missing.** Its folder has moved: usually `SENTINEL_RECORDINGS_DIRECTORY` was changed. Copy the old files across, keeping their subfolders.
- **A recording is marked failed.** It ran past **Max Recording Length**, usually because the browser closed before it was stopped.
