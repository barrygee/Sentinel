<template>
  <a class="skip-link" href="#main">Skip to main content</a>

  <SdrManagerOnlyHeader />

  <main id="main" tabindex="-1">
    <SettingsPanel v-if="sdrManagerRegistered" pinned />
    <SdrManagerUnavailableNotice v-else />
  </main>
</template>

<script setup lang="ts">
/**
 * `SdrManagerOnlyShell` — the whole app in SDR Manager-only mode (ADR 0007,
 * `SENTINEL_MODE=sdr-manager-local-only`): this machine's SDRs, shared with
 * other Sentinels, and nothing else. Where the full app (App.vue) has the map,
 * the section nav, the sidebar and the footer, this has the nav bar with a
 * mode badge and the Settings page pinned in place of the map — opened on
 * SDR Manager, with App Settings trimmed to what this mode has (`modes` on
 * each setting, shell/appMode.ts).
 *
 * It downloads no map: main.ts mounts it instead of App, and nothing it
 * imports draws one (App Settings' map controls load only when shown).
 */
import SettingsPanel from '@/components/shared/SettingsPanel.vue'
import SdrManagerOnlyHeader from '@/components/sdr-manager-only/SdrManagerOnlyHeader.vue'
import SdrManagerUnavailableNotice from '@/components/sdr-manager-only/SdrManagerUnavailableNotice.vue'
import { useSettingsRouteSync } from '@/composables/useSettingsRouteSync'
import { useConfigFileSync } from '@/composables/useConfigFileSync'
import { getSettingsSections } from '@sentinel/shell-api/shell/settingsRegistry'
import { SDR_MANAGER_SETTINGS_SECTION } from '@sentinel/shell-api/shell/sdrManagerSettingsSection'

// The URL names the Settings section shown, as in the full app.
useSettingsRouteSync()
// A hand-edit of sentinel_config.json (the location) shows here too.
useConfigFileSync()

// sdr-manager-local registers the section when its remote loads (main.ts
// loads every remote before mounting), so this is known up front.
const sdrManagerRegistered = getSettingsSections().some(
  (section) => section.key === SDR_MANAGER_SETTINGS_SECTION.key,
)

// One page, so one title (WCAG 2.4.2).
document.title = 'SENTINEL — SDR MANAGER'
</script>
