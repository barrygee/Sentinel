# 3D Globe

An optional section: a 3D globe of the world with live aircraft, satellites, vessels and APRS stations on it, and a switch for each kind. It is being built in steps; for now the **GLOBE** page shows a placeholder.

## Switch the globe on

The globe starts switched off.

1. **Settings › App Settings › SECTIONS › 3D Globe**: turn the switch on.
2. **APPLY CHANGES**. **GLOBE** appears in the nav.

Turn the switch off and apply to hide it again. The setting is `globe.enabled` in the [config file](settings.md).

## Run without the globe

The globe has its own small service, `globe`, which runs even while the switch is off. To not run it at all, set `SENTINEL_GLOBE_REPLICAS=0` in `.env` (see [Environment variables](../configuration.md)); the switch then disappears from Settings.
