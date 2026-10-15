# Change settings

This page explains how Settings works: where to find a setting, and why your changes wait until you apply them.

## Open Settings

Select the gear at the bottom right of the screen. Settings fills the screen, with its own menu on the left: **App Settings** for things that affect all of Sentinel, then one entry for each section you run (**AIR**, **SPACE**, **SEA**, **LAND**, **SDR**). Close it with the close button or **Escape**, and you go back to the section you came from.

![Settings › App Settings: the Settings menu down the left with Docs at the bottom, SEARCH SETTINGS at the top, Connectivity Mode and Alert Sound, and APPLY CHANGES at the bottom right.](../images/settings-app.png)

Each part of Settings has its own web address, such as `/settings/sea`, so you can bookmark it or send it to someone on your network.

## Find a setting

Type in **SEARCH SETTINGS** at the top. Settings lists every setting whose name or description contains all the words you typed, in any section. Search for what a setting does, not only its name: "squawk", "recordings" or "coverage" all work.

Where a setting has a page in these docs, a link beside it opens that page.

## Apply your changes

Most settings don't take effect as you change them. Sentinel holds your changes until you select **APPLY CHANGES** at the bottom of Settings, then saves them all at once. This lets you change several related settings, such as a radio and the mode that uses it, and have them take effect together.

- After **APPLY CHANGES**, Sentinel updates in place. You don't need to reload the page.
- If you select **APPLY CHANGES** with nothing changed, it says **NO CHANGES**.
- If you close Settings or move to another part of it without applying, your changes are thrown away.

A few controls act straight away because they do something rather than set something: **UPDATE TLE**, adding or removing a radio or Sentry host, **DOWNLOAD** in Offline Maps, and **EXPORT** buttons.

Settings are saved on the Sentinel computer, not in your browser, so every browser and device that opens Sentinel sees the same settings.

## Online or off grid

**Settings › App Settings › Connectivity Mode** switches all of Sentinel between **ONLINE** (data from the internet) and **OFF GRID** (data from your own radios, maps you downloaded and data already stored). Choosing it sets every section to that mode.

Air and Sea also have a **Source Override** in their own settings, to run that one section differently: for example Sea off grid from your own AIS radio while Air stays online. Choosing **Connectivity Mode** again replaces these overrides; the **SECTION OVERRIDES** list under it shows what each section will become.

## Back up your settings

**Settings › App Settings › Export All Configuration** saves all your settings, frequencies and band plan to a folder you choose, as three files: `sentinel_config.json`, `sdr_frequencies.json` and `sdr_bandplan.json`. To edit or load settings as a file, see [Edit the config file](config-file.md).
