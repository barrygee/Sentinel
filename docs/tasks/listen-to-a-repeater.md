# Find and listen to a local repeater

Use the Land map to find amateur radio repeaters near you, then listen to one with your radio. Repeaters carry local amateur conversations and nets, and are a good way to hear what is happening on the bands near you.

## Before you start

- Land switched on: [Switch Land on](../use/land.md#switch-land-on).
- A radio added, with an antenna for the band (2 m and 70 cm are the busiest): [Add a radio](../use/sdr/add-a-radio.md).

## Steps

1. **Open LAND.** The map shows UK repeaters. Select **GO TO MY LOCATION** in the map controls to centre on where you are.
2. **Open the filters.** Open **FILTER** in the sidebar.
3. **Narrow it down.** Choose a **Band** such as 2 m, a **Mode** such as FM (most handheld radios), and **On air** under **Status**. The map shows only matching repeaters.
4. **Pick one.** Select a nearby repeater on the map or in the list. Its details show where it is, its height, and each channel's frequencies and access tone.
5. **Listen.** Select its **OUTPUT** frequency. Your radio tunes to it in the right mode and starts playing.
6. **Set the squelch.** In **SDR**, under **CONTROLS**, raise **SQUELCH** until the hiss stops between transmissions.
7. **Save it** (optional). Select **SAVE FREQUENCY** on the repeater's channel to add it to your saved frequencies, so you can tune to it or scan it later from **SDR**.

The tuned frequency shows in the footer, and the audio keeps playing while you look at other sections.

## Tips

- Repeaters are busiest at evenings and weekends, and during scheduled nets.
- Several repeaters saved in one group can be scanned together: see [Scan saved frequencies](../use/sdr/frequencies.md#scan-saved-frequencies).
- Listening needs no licence. To talk through a repeater you need an amateur radio licence, and a transmitter: Sentinel only receives.

## Troubleshooting

- **The frequency can't be selected.** No radio is connected. The button says **Connect an SDR to tune**.
- **Only noise.** The repeater may be out of range, or quiet. Try one nearer, or higher up, and check the antenna suits the band.
- **The repeater's details look wrong.** Online, the directory updates daily from ukrepeater.net. You can correct an entry in **Settings › LAND › Repeater Directory (JSON)**.
