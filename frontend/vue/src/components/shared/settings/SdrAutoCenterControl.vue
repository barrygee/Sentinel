<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useSdrStore } from '@/stores/sdr'

// Auto-center toggle for the SDR spectrum/waterfall. Lives in the `sdr`
// settings namespace so it persists in the app config DB like every other
// Settings entry. The sdr store is the live source the waterfall click handler
// and the audio NCO read; BaseToggleSetting mirrors the toggle into it
// immediately (so the behaviour previews live) but defers the DB write to
// APPLY CHANGES via @stage, matching the other Settings toggles.
const sdr = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

// Re-hydrates the sdr store from the DB (store owns the fetch + apply). Runs
// on mount AND when the config JSON editor uploads a new config, so the JSON
// editor, this toggle and the live waterfall behaviour stay in sync. (SdrPanel
// listens for the same event so the store also syncs when this control isn't
// mounted.)
</script>

<template>
  <BaseToggleSetting
    label="AUTO-CENTER ON TUNE"
    accessible-name="Toggle auto-center the spectrum and waterfall on the tuned frequency"
    namespace="sdr"
    setting-key="autoCenterWaterfallOnTune"
    :hydrate-from-db="sdr.hydrateAutoCenterFromDb"
    :read-from-store="() => sdr.autoCenterWaterfallOnTune"
    :mirror-to-store="sdr.setAutoCenterWaterfallOnTune"
    @stage="emit('stage', $event)"
  />
</template>
