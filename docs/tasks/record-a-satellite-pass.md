# Catch a satellite pass and record it

Set Sentinel to tune your radio to a satellite as it rises, record it, and tune back when it sets, so you catch the pass even if you aren't watching. A good first target is the International Space Station, or a weather or amateur radio satellite.

## Before you start

- Your **Sentinel Location** is set (**Settings › App Settings › Sentinel Location**). Passes are worked out for that spot.
- A radio is added and connected: [Add a radio](../use/sdr/add-a-radio.md).
- An antenna that suits the satellite's band, ideally outdoors with a clear view of the sky. Most amateur and weather satellites transmit around 137 MHz or 145 MHz.

## Steps

1. **Load the satellites.** In **Settings › SPACE › Online Data Source**, choose a category such as **Amateur Radio**, **Weather** or **Space Stations**, then select **UPDATE TLE**. The satellites appear in **SPACE**.
2. **Choose where the recording goes** (optional). Set **Settings › SDR › SDR Options › Recordings Folder** to something like `satellites`, and select **APPLY CHANGES**. See [Record what you hear](../use/sdr/record.md#the-recordings-folder).
3. **Find a good pass.** Open **SPACE** and the **PASSES** pane in the sidebar. Pick a pass with a high maximum elevation: one of 30° or more is stronger and clearer than one that skims the horizon. Select it to see its path across your sky.
4. **Get a reminder** (optional). Select **Enable pass alerts** (the bell). About five minutes before the satellite rises, an alert tells you it is coming.
5. **Turn on auto-tune.** Select **Auto-tune SDR**. If it isn't offered, Sentinel doesn't know the satellite's downlink frequency; add it in **Settings › SPACE › Satellite Frequencies (JSON)**.
6. **Turn on recording.** Select **Record pass**.
7. **Leave Sentinel open** in a browser tab. You can look at other sections in the meantime.

When the satellite rises, the radio tunes to its downlink, recording starts, and an alert says so. When it sets, recording stops and the radio goes back to what it was doing.

## Afterwards

Open **SDR** and the **RECORDINGS** tab. The pass is there: play it, or select **Download WAV** to open it in other software. For a weather satellite's picture, open the WAV in an APT image decoder. To re-tune or decode it differently later, turn on **Record Raw IQ with Recordings (Large Files)** before the next pass; see [WAV and raw IQ](../use/sdr/record.md#wav-and-raw-iq).

## Troubleshooting

- **An alert says the pass was skipped because the radio is busy.** An earlier pass still has the radio. Only one pass can use a radio at a time.
- **Nothing happened at the pass.** Check that a browser had Sentinel open, and that the radio wasn't held by a decoder (it reads **RESERVED** in the SDR panel).
- **The recording is silent.** The squelch was above the signal, so nothing was recorded. Lower **SQUELCH** in the SDR panel before the next pass.
- **The signal fades in and out.** Normal near the horizon, and as the satellite turns. A better antenna or a higher pass helps.
