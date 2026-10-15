# Get alerted to aircraft emergencies

Have Sentinel tell you whenever an aircraft near you declares an emergency, whether or not anyone is watching the map. Sentinel keeps checking in the background, so the alert is waiting for you when you next open it.

## Before you start

- Sentinel installed and running, with the Air section ([Quick start](../install.md)).
- Online: an internet connection. Off grid: off-grid Air set up ([Air: Off grid](../use/air.md#off-grid)).

## Steps

1. **Open your location setting.** Open **Settings › App Settings › Sentinel Location**.
2. **Enter where you are.** Type your **LATITUDE** and **LONGITUDE** in decimal degrees.
3. **Apply it.** Select **APPLY CHANGES**. The fields keep your values, and **RANGE RING** on the Air map now centres on you. Online, the background check now covers the area around this point; off grid, it covers what your receiver hears.
4. **Turn on the sound** (optional). Turn on **Settings › App Settings › Alert Sound** and select **APPLY CHANGES**, to hear new alerts as well as see them.
5. **Choose how often to check** (optional). **Settings › AIR › Online Squawk Checks** (and **Off Grid Squawk Checks**) set the seconds between background checks. Raise them to use less internet or radio time; see [Air: Settings](../use/air.md#settings).

That's all. The check runs whenever no browser has the AIR map open; while one does, the map's own updates are checked instead.

## When an emergency happens

An alert appears under **ALERTS** in the sidebar, naming the aircraft and the emergency: squawk 7700 (general emergency), 7600 (radio failure) or 7500 (hijacking). What each code means, and how far the check reaches, is in [Air: Get alerted to emergencies](../use/air.md#get-alerted-to-emergencies).

Select the alert to open **AIR** centred on the aircraft. Its details show its height, speed and heading. Another alert follows when it changes back to a normal code.

Most emergency squawks end safely: many are precautions, such as a medical problem on board or a fault the crew are handling calmly. Don't share or act on them as news.

## Troubleshooting

- **No alerts, but you know of an emergency.** Check that the aircraft was within range of your **Sentinel Location** (see [Air](../use/air.md#get-alerted-to-emergencies)), that the `air` service is running (`docker compose ps air`), and, off grid, that the decoder was receiving.
- **Alerts arrive late.** Raise the check frequency by lowering **Online Squawk Checks**.
