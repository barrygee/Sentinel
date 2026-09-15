<template>
  <div class="sdr-devices-accordion">
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">ID</span>
      <input
        v-if="!feed"
        ref="idRef"
        v-model="idDraft"
        type="text"
        class="sdr-devices-form-input"
        aria-label="Feed id"
        placeholder="e.g. durham-cc"
        autocomplete="off"
        spellcheck="false"
      />
      <span v-else class="land-feed-form-static">{{ feed.id }}</span>
    </div>

    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">NAME</span>
      <input
        v-model="nameDraft"
        type="text"
        class="sdr-devices-form-input"
        aria-label="Feed name"
        placeholder="e.g. Durham County Council"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">PROVIDER</span>
      <select
        v-model="providerDraft"
        class="sdr-devices-form-input"
        aria-label="Feed provider"
        :disabled="feed !== null"
      >
        <option value="durham">Durham County Council</option>
        <option value="tfl-jamcams">TfL JamCams</option>
        <option value="snapshot">Generic snapshot</option>
      </select>
    </div>

    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">URL</span>
      <input
        v-model="urlDraft"
        type="url"
        class="sdr-devices-form-input"
        aria-label="Feed URL"
        placeholder="https://…"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <template v-if="providerDraft === 'snapshot'">
      <div class="sdr-devices-form-row">
        <span class="sdr-devices-form-label">LATITUDE</span>
        <input
          v-model.number="latitudeDraft"
          type="number"
          class="sdr-devices-form-input"
          aria-label="Camera latitude"
          step="0.000001"
          min="-90"
          max="90"
        />
      </div>
      <div class="sdr-devices-form-row">
        <span class="sdr-devices-form-label">LONGITUDE</span>
        <input
          v-model.number="longitudeDraft"
          type="number"
          class="sdr-devices-form-input"
          aria-label="Camera longitude"
          step="0.000001"
          min="-180"
          max="180"
        />
      </div>
    </template>

    <template v-if="providerDraft === 'tfl-jamcams'">
      <div class="settings-location-field">
        <label class="settings-location-label" :for="appKeyInputId">APP KEY (OPTIONAL)</label>
        <input
          :id="appKeyInputId"
          v-model="appKeyDraft"
          type="password"
          class="settings-location-input"
          placeholder="raises the anonymous 50 req/min limit to 500"
          spellcheck="false"
          autocomplete="off"
        />
        <p class="settings-location-hint">
          {{
            credentialConfigured
              ? 'A key is stored — leave blank to keep it.'
              : 'Works anonymously without one, at a lower rate limit.'
          }}
        </p>
      </div>
      <div v-if="credentialConfigured" class="settings-location-actions">
        <BaseButton variant="ghost" bordered @click="clearAppKey">CLEAR KEY</BaseButton>
      </div>
    </template>

    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">REFRESH (S)</span>
      <input
        v-model.number="refreshSecondsDraft"
        type="number"
        class="sdr-devices-form-input"
        aria-label="Refresh interval in seconds"
        min="15"
        max="3600"
      />
    </div>

    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">ENABLED</span>
      <BaseToggleSwitch v-model="enabledDraft" accessible-name="Feed enabled" />
    </div>

    <div v-if="feed" class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">TEST</span>
      <div class="land-feed-form-test">
        <BaseButton variant="ghost" :disabled="testing" @click="runTest">TEST FEED</BaseButton>
        <span v-if="testResult" class="land-feed-form-test-result">
          {{ testResult.ok ? 'OK' : 'FAILED' }} — {{ testResult.message }}
          <template v-if="testResult.ok">({{ testResult.featureCount }} features)</template>
        </span>
      </div>
    </div>

    <div v-if="errorMsg" class="sdr-devices-form-error">{{ errorMsg }}</div>
    <div class="sdr-devices-form-actions">
      <BaseButton
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        :style="GHOST_BUTTON_STYLE"
        @click="emit('cancel')"
        >CANCEL</BaseButton
      >
      <BaseButton
        type="button"
        variant="primary"
        class="sdr-devices-btn sdr-devices-btn--primary"
        :style="PRIMARY_BUTTON_STYLE"
        @click="save"
      >
        SAVE
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `LandFeedForm` — the add/edit form for one row in `LandFeedsControl`
 * (Settings › LAND › LIVE FEEDS), cloned from `SdrDeviceForm`'s shape.
 *
 * Unlike the SDR devices editor, this form does not write to the backend
 * directly: it hands the edited {@link FeedConfig} (and, for a TfL JamCams
 * feed, an optional deferred credential write) back to `LandFeedsControl`,
 * which folds every open edit into the single staged writer APPLY CHANGES
 * invokes — the feed list is one settings value (`land.feeds`), so it can
 * only ever be staged as a whole.
 *
 * The provider dropdown drives which fields render, matching each adapter's
 * actual inputs (see the P0 contract): `snapshot` needs a location because it
 * has no feature list of its own to derive coordinates from; `durham` needs
 * only its URL; `tfl-jamcams` takes an optional API key that lifts its
 * anonymous rate limit.
 */
import { onMounted, ref, useId, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseToggleSwitch from '@/components/base/BaseToggleSwitch.vue'
import { useLandFeedsStore } from '@/stores/landFeeds'
import type {
  FeedAuthConfig,
  FeedConfig,
  FeedLocation,
  FeedProvider,
  FeedTestResult,
} from '@/types/landFeeds'

const GHOST_BUTTON_STYLE =
  '--ba-ghost-height: auto; --ba-ghost-padding: 8px 18px; --ba-ghost-font-size: 10px; ' +
  '--ba-ghost-color: rgba(16, 19, 29, 0.6); --ba-ghost-hover-color: rgba(16, 19, 29, 0.9)'
const PRIMARY_BUTTON_STYLE =
  '--ba-primary-padding: 8px 18px; --ba-primary-font-size: 10px; ' +
  '--ba-primary-font-weight: 600; --ba-primary-letter-spacing: 0.16em'

const FEED_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/
const MIN_REFRESH_SECONDS = 15
const MAX_REFRESH_SECONDS = 3600

const props = defineProps<{
  /** The feed being edited, or null when adding a new one. */
  feed: FeedConfig | null
}>()
const emit = defineEmits<{
  /** The edited feed, plus a deferred credential write to fold into the same
   *  staged APPLY as the feed-list write (undefined = no credential change). */
  save: [feed: FeedConfig, credentialOp: (() => Promise<unknown>) | undefined]
  cancel: []
}>()

const landFeedsStore = useLandFeedsStore()

const appKeyInputId = useId()
const idRef = ref<HTMLInputElement | null>(null)
const errorMsg = ref('')
const testing = ref(false)
const testResult = ref<FeedTestResult | null>(null)
const credentialConfigured = ref(false)
/** Whether the operator explicitly cleared the stored key this edit — folded
 *  into the deferred credential op the next SAVE stages, matching
 *  `SeaAisKeyControl`'s "FORGET KEY only takes effect on APPLY" behaviour. */
const pendingClearOnly = ref(false)

const idDraft = ref(props.feed?.id ?? '')
const nameDraft = ref(props.feed?.name ?? '')
const providerDraft = ref<FeedProvider>(props.feed?.provider ?? 'durham')
const urlDraft = ref(props.feed?.url ?? '')
const latitudeDraft = ref<number | null>(props.feed?.location?.latitude ?? null)
const longitudeDraft = ref<number | null>(props.feed?.location?.longitude ?? null)
const appKeyDraft = ref('')
const refreshSecondsDraft = ref(
  props.feed?.refreshSeconds ?? defaultRefreshSecondsFor(providerDraft.value),
)
const enabledDraft = ref(props.feed?.enabled ?? false)

function defaultRefreshSecondsFor(provider: FeedProvider): number {
  return provider === 'tfl-jamcams' ? 300 : 60
}

// A brand-new feed's refresh interval starts at the *initial* provider's
// default (durham, since that's the dropdown's default). Switching the
// provider before the first save must re-apply the new provider's default too
// — otherwise picking TfL JamCams silently keeps Durham's 60s default instead
// of JamCams' gentler 300s — so this only follows the provider while the
// operator has not yet typed their own value. (The provider field is disabled
// when editing an existing feed, so this can only fire for a new one.)
watch(providerDraft, (provider, previousProvider) => {
  if (refreshSecondsDraft.value === defaultRefreshSecondsFor(previousProvider)) {
    refreshSecondsDraft.value = defaultRefreshSecondsFor(provider)
  }
})

/** Default `datasets` per provider — fixed in P0, not user-editable. */
function defaultDatasets(provider: FeedProvider): string[] {
  if (provider === 'durham') return ['cameras']
  if (provider === 'tfl-jamcams') return ['jamcams']
  return []
}

/** Default `auth` shape per provider (never carries the secret itself). */
function defaultAuth(provider: FeedProvider): FeedAuthConfig {
  if (provider === 'tfl-jamcams') return { type: 'apiKey', queryParam: 'app_key', optional: true }
  return { type: 'none' }
}

async function loadCredentialStatus(): Promise<void> {
  if (!props.feed || props.feed.provider !== 'tfl-jamcams') return
  const status = await landFeedsStore.credentials.get(props.feed.id)
  credentialConfigured.value = status.configured
}

onMounted(() => {
  void loadCredentialStatus()
  setTimeout(() => idRef.value?.focus(), 0)
})

function clearAppKey(): void {
  appKeyDraft.value = ''
  credentialConfigured.value = false
  // Folded straight into the deferred credential op the next SAVE stages —
  // clearing is itself a save action here, matching SeaAisKeyControl's
  // "FORGET KEY" behaviour of only taking effect on APPLY. CLEAR KEY is only
  // rendered for a stored key, which only a persisted feed can have.
  pendingClearOnly.value = true
}

/**
 * The snapshot provider's fixed camera position, or null when the provider
 * isn't snapshot or either coordinate is still blank — `validate()` turns the
 * latter into the user-facing error, so `save()` can rely on a non-null result.
 */
function snapshotLocation(): FeedLocation | null {
  if (providerDraft.value !== 'snapshot') return null
  if (latitudeDraft.value === null || longitudeDraft.value === null) return null
  return { latitude: latitudeDraft.value, longitude: longitudeDraft.value }
}

function validate(): string | null {
  if (!props.feed) {
    if (!FEED_ID_PATTERN.test(idDraft.value.trim())) {
      return 'ID must be lowercase letters, numbers and hyphens, 2-40 characters.'
    }
  }
  if (!nameDraft.value.trim()) return 'Name is required.'
  if (!urlDraft.value.trim().startsWith('https://')) return 'URL must be https.'
  if (providerDraft.value === 'snapshot' && snapshotLocation() === null) {
    return 'Latitude and longitude are required for a snapshot feed.'
  }
  return null
}

function save(): void {
  const validationError = validate()
  if (validationError) {
    errorMsg.value = validationError
    return
  }
  errorMsg.value = ''
  const id = props.feed?.id ?? idDraft.value.trim()
  const refreshSeconds = Math.min(
    MAX_REFRESH_SECONDS,
    Math.max(MIN_REFRESH_SECONDS, Math.round(refreshSecondsDraft.value)),
  )
  const feed: FeedConfig = {
    id,
    name: nameDraft.value.trim(),
    category: 'traffic-cameras',
    provider: providerDraft.value,
    url: urlDraft.value.trim(),
    enabled: enabledDraft.value,
    refreshSeconds,
    datasets: props.feed?.datasets ?? defaultDatasets(providerDraft.value),
    bbox: props.feed?.bbox ?? null,
    location: snapshotLocation(),
    auth: props.feed?.auth ?? defaultAuth(providerDraft.value),
  }

  const trimmedKey = appKeyDraft.value.trim()
  let credentialOp: (() => Promise<unknown>) | undefined
  if (providerDraft.value === 'tfl-jamcams' && trimmedKey) {
    credentialOp = () => landFeedsStore.credentials.set(id, { apiKey: trimmedKey })
  } else if (pendingClearOnly.value) {
    credentialOp = () => landFeedsStore.credentials.clear(id)
  }

  emit('save', feed, credentialOp)
}

async function runTest(): Promise<void> {
  /* v8 ignore start -- defensive: the TEST FEED button is only rendered for a
     persisted feed, so there is no UI path that calls this without one. */
  if (!props.feed) return
  /* v8 ignore stop */
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await landFeedsStore.test(props.feed.id)
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.land-feed-form-static {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  color: rgba(16, 19, 29, 0.7);
}
.land-feed-form-test {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.land-feed-form-test-result {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  color: rgba(16, 19, 29, 0.7);
}
</style>
