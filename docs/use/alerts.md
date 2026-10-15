# Alerts

Alerts tell you when something you care about happens, in any section, while you are looking at another. This page covers what raises an alert, where to find them, and how to turn them off.

## What raises an alert

| Alert | Raised when | Turn it on |
|---|---|---|
| Aircraft emergency | An aircraft squawks 7700, 7600 or 7500. Raised even when no browser has Sentinel open. | Always on. See [Air: Get alerted to emergencies](air.md#get-alerted-to-emergencies). |
| Aircraft landing and departure | An aircraft you chose lands or takes off. | **Enable alerts** in the aircraft's details. |
| Aircraft overhead | A civil or military aircraft comes close to your location or a Sentry site. | **Settings › AIR › Overhead Aircraft Alerts**. |
| Satellite pass | A satellite you chose rises in about five minutes. | **Enable pass alerts** on a pass. See [Space](space.md#get-an-alert-before-a-pass). |
| Auto-tune | Your radio retuned for a satellite pass, or couldn't. | **Auto-tune SDR** on a pass. |
| Tracking | You started or stopped following an aircraft or satellite. | Happens when you track something. |

## Where alerts show

Alerts collect under **ALERTS** in the sidebar, newest first. The **ALERTS** button pulses when there is one you haven't seen. Turn on **Settings › App Settings › Alert Sound** to hear a sound as well.

![The ALERTS pane: an aircraft emergency marked EMERGENCY in red at the top, a satellite pass notice below it, each with a dismiss button, and CLEAR at the bottom.](../images/alerts-pane.png)

Sentinel keeps your alerts, so one raised while no browser was open is waiting when you next open it.

## Go to what an alert is about

Select an alert to go to its subject: an aircraft alert opens **AIR** and centres the map on the aircraft; a satellite alert opens **SPACE** on the satellite.

## Dismiss or turn off alerts

Each alert has a button on its right:

- **Dismiss** (✕) removes that one alert.
- **Disable alerts** (the crossed-out bell) removes it and stops alerts of that kind for that aircraft or satellite.
- **Disable autotune** (✕ on an auto-tune alert) cancels auto-tune for that satellite.

**Clear alerts** at the bottom of the list removes them all.

To see and turn off every alert you have set up in one place, open **Settings › App Settings › Alerts**. It lists each aircraft, satellite and overhead area you get alerts for, with a switch for each.
