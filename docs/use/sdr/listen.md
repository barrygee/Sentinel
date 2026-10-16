# Listen

See a whole band at once, tune to a signal and listen.

## Features

- **Spectrum**: signal strength across the band now. A peak is a signal.
- **Waterfall**: the same over time, newest at the top. Brighter is stronger.
- **Markers** for saved and known frequencies; **band plan** strip showing what each part of the band is for.
- **ZOOM**, drag the scale to move along the band, and min/max dB sliders to make weak signals stand out.
- **Tune** by selecting a signal, typing MHz and **Enter**, or scrolling over a digit.
- **Modes**: NFM, WFM, AM, USB, LSB, CW.
- **CONTROLS**: **VOLUME**, **SQUELCH**, **BANDWIDTH** (or drag its edges on the waterfall), **RF GAIN** or **AGC**, **SAMPLE RATE**.
- **SIGNAL** meter.
- **Plays everywhere**: audio continues in other sections, Settings and Docs; the footer shows the frequency.
- **Timestamps** down the waterfall, every so many seconds.

![The SDR section playing the Calling channel on 145.5000 MHz in NFM: the radio panel with the SIGNAL meter, MODULATION and SETTINGS on the left; the spectrum with saved-frequency markers along its top, and a full waterfall showing the steady signal, conversations keying up and down, and APRS bursts on 144.800 MHz.](../../images/sdr-radio-panel.png)

## Listen

1. Open **SDR** and pick your radio.
2. Tune to a frequency, and choose **MODULATION**.
3. **Tune** (▶) starts the audio; **Stop audio** (■) stops it.

## Which mode

| Mode | For |
|---|---|
| **NFM** | Two-way radio, amateur repeaters, PMR446, marine VHF |
| **WFM** | FM broadcast |
| **AM** | Airband |
| **USB** | Amateur voice above 10 MHz, data modes |
| **LSB** | Amateur voice below 10 MHz |
| **CW** | Morse |

## Settings

All in **Settings › SDR › SDR Options**.

| Setting | What it does |
|---|---|
| **Auto-center Waterfall on Tune** | Keeps the tuned frequency in the middle |
| **Snap to Known Frequencies** | Selecting near one tunes exactly to it |
| **Show Band Plan** | The coloured band strip |
| **Display Known Frequencies** | Frequency markers on the waterfall |
| **Mute Audio While Decoding** | Silence while a digital decoder runs |
| **Show Waterfall Timestamps** / **Interval (Seconds)** | Time marks down the waterfall |

**Band Plan (JSON)** (in **Settings › SDR**) edits the band strip for your country.

## Tips

- **SQUELCH**: raise it until the hiss stops, then a little more.
- **RF GAIN**: too high swamps everything; too low loses weak signals.
- A higher **SAMPLE RATE** shows more band but uses more network and CPU.

## If it's not working

- **No sound:** check **Tune** is on, volume up, squelch below the signal. Click the page once: browsers block sound until you do.
- **Distorted or crowded:** lower **RF GAIN** or narrow **BANDWIDTH**.
- **Only noise:** check the mode and that the antenna suits the band.
