# Save and scan frequencies

Save the frequencies you listen to, sort them into groups, and let Sentinel scan them or sweep a range for activity. You need a radio added first; see [Add a radio](add-a-radio.md).

## Save a frequency

1. In the SDR radio panel, open the **FREQUENCY MANAGER** tab.
2. Under **ADD FREQUENCY**, fill in a **LABEL** (such as `Local repeater`), the **FREQ (MHz)** and the **MODE**.
3. Tick any **GROUPS** it belongs to, and add **NOTES** if you like.
4. Select **SAVE**.

It is marked on the waterfall from then on. Select **Tune to** next to any saved frequency to listen to it. Other sections can save frequencies here too, such as **SAVE FREQUENCY** on a Land repeater.

Mark a frequency as a **Favourite** (the star) to add it to **FAVOURITES** on the **RADIO** tab, for one-click tuning.

## Sort frequencies into groups

Groups keep related frequencies together, such as "Airband" or "Marine", and give them a colour on the waterfall.

1. Open the **GROUPS** tab.
2. Type a group name and select **ADD**.
3. Rename or delete a group with the buttons beside it. Deleting a group doesn't delete its frequencies.

To show only some groups in the frequency list, choose them in the group filter at the top of **FREQUENCY MANAGER**.

## Scan saved frequencies

The scanner steps through your saved frequencies and stops on any that has a signal, like a handheld scanner.

1. On the **RADIO** tab, open **SCANNER**.
2. Choose **All**, or select the groups to scan.
3. Set **SQUELCH** (under **CONTROLS**) a little above the noise. The scanner treats anything louder than the squelch as a signal.
4. Select **Start scan**. The header reads **SCANNING**.

When it finds a signal it stops there and reads **SCANNING PAUSED** while you listen. When the signal ends, it carries on. Select **Stop scan** to stop.

**Settings › SDR › SDR Options › Scan / Search Resume Delay (Seconds)** sets how long it waits after a signal ends before moving on. Raise it to hear replies in a conversation.

## Search a range for activity

A search sweeps every step between two frequencies, looking for signals you haven't saved.

1. On the **RADIO** tab, open **SEARCH**.
2. Enter **LOW (MHz)**, **HIGH (MHz)** and the **STEP** (the gap between frequencies to try; use the channel spacing of the band, such as 12.5 kHz).
3. Select **Start search**. It stops on signals the same way the scanner does.

To keep a range for later, add it in the **SEARCH RANGES** tab under **ADD RANGE**: give it a **LABEL**, the low and high frequencies, **STEP**, how long to listen on each step (dwell time), **MODE** and the signal threshold. Saved ranges appear under **SAVED RANGES** in **SEARCH**, each with its own start button.

## Edit many at once

**Settings › SDR › Frequencies & Groups (JSON)** holds every saved frequency, group and search range in one JSON file. Select **EDIT** to change it there, then **APPLY CHANGES**, or **EXPORT** to download it as a backup or to load into another Sentinel.
