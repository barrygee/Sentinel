<template>
  <div id="sdr-group-list">
    <div class="sdr-group-pills">
      <div v-for="g in sortedGroups" :key="g.id" class="sdr-group-pill">
        <span class="sdr-group-pill-name">{{ g.name }}</span>
        <BaseIconAction
          class="sdr-group-pill-edit"
          title="Rename group"
          accessible-name="Rename group"
          @click.stop="startEditGroupRow(g)"
        >
          &#x270E;
        </BaseIconAction>
        <BaseIconAction
          class="sdr-group-pill-del"
          title="Delete group"
          accessible-name="Delete group"
          @click.stop="deleteGroup(g.id)"
        >
          &#x2715;
        </BaseIconAction>
      </div>
    </div>
  </div>
  <div class="sdr-panel-add-row sdr-frequency-manager-group-add-row">
    <input
      ref="newGroupNameRef"
      v-model="newGroupName"
      class="sdr-panel-input"
      type="text"
      aria-label="New group name"
      placeholder="Group name…"
      maxlength="40"
      @keydown.enter="submitGroupRow"
      @keydown.escape="cancelEditGroupRow"
    />
    <BaseButton
      v-if="editingGroupId !== null"
      variant="ghost"
      class="sdr-panel-btn"
      @click="cancelEditGroupRow"
    >
      CANCEL
    </BaseButton>
    <BaseButton variant="ghost" class="sdr-panel-btn" @click="submitGroupRow">
      {{ editingGroupId !== null ? 'SAVE' : 'ADD' }}
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
/**
 * SdrGroupsTab — the GROUPS tab of the SDR side panel: lists the frequency
 * groups as pills and provides add / inline-rename / delete (CRUD against
 * /api/sdr/groups). Reads the group list from the SDR store (the single
 * owner) and emits `changed` after every successful mutation so the parent
 * panel can run its full data reload (frequencies, scan queue, recordings).
 *
 * The tab's own families — the group pills and the add row — are styled by
 * the unscoped block below (B10 CSS co-location). The pill edit/delete glyph
 * chrome stays in SdrPanel.css: those rules are grouped with their
 * `.sdr-freq-row-edit` siblings, which another component renders.
 */
import { ref, computed, nextTick } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconAction from '@/components/base/BaseIconAction.vue'
import { useSdrStore } from '@/stores/sdr'
import type { SdrFrequencyGroup } from '@/stores/sdr'

const emit = defineEmits<{
  /** Fired after a successful add/rename/delete so the parent reloads data. */
  (event: 'changed'): void
}>()

const sdrStore = useSdrStore()

const groups = computed<SdrFrequencyGroup[]>(() => sdrStore.groups)

const sortedGroups = computed<SdrFrequencyGroup[]>(() =>
  groups.value
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
)

const newGroupName = ref('')
const editingGroupId = ref<number | null>(null)
const newGroupNameRef = ref<HTMLInputElement | null>(null)

async function addGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    const res = await fetch('/api/sdr/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: '#c8ff00', sort_order: groups.value.length }),
    })
    if (res.ok) {
      newGroupName.value = ''
      emit('changed')
    }
  } catch (_) {}
}

function startEditGroupRow(g: SdrFrequencyGroup) {
  editingGroupId.value = g.id
  newGroupName.value = g.name
  nextTick(() => newGroupNameRef.value?.focus())
}

function cancelEditGroupRow() {
  editingGroupId.value = null
  newGroupName.value = ''
}

async function submitGroupRow() {
  if (editingGroupId.value !== null) {
    const name = newGroupName.value.trim()
    if (!name) return
    try {
      const existing = groups.value.find((g) => g.id === editingGroupId.value)
      await fetch(`/api/sdr/groups/${editingGroupId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
          color: existing?.color ?? '#c8ff00',
          sort_order: existing?.sort_order ?? 0,
          /* v8 ignore stop */
        }),
      })
      editingGroupId.value = null
      newGroupName.value = ''
      emit('changed')
    } catch (_) {}
  } else {
    await addGroup()
  }
}

async function deleteGroup(id: number) {
  try {
    await fetch(`/api/sdr/groups/${id}`, { method: 'DELETE' })
    emit('changed')
  } catch (_) {}
}
</script>

<!-- Unscoped on purpose (B10 CSS co-location): the GROUPS tab's families
     moved here verbatim from SdrPanel.css, preserving their original relative
     order — CASCADE-CRITICAL: `.sdr-frequency-manager-group-add-row` and
     `.sdr-panel-add-row` style the SAME element at equal specificity with
     conflicting padding, and `.sdr-panel-add-row` (originally the later rule)
     must stay the winner, so it remains the later rule here. `scoped` would
     add [data-v] attribute selectors and RAISE specificity over the original
     global rules. Loaded after SdrPanel.css (component modules import after
     SdrPanel.vue's leading CSS import). The pill edit/delete glyph chrome
     stays in SdrPanel.css, grouped with its `.sdr-freq-row-edit` siblings;
     `.sdr-group-pill-del:hover` here beats that base chrome by specificity
     (0,2,0 vs 0,1,0), not order. -->
<style>
.sdr-frequency-manager-group-add-row {
  padding: 10px 20px 24px 24px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.sdr-frequency-manager-group-add-row .sdr-panel-input {
  flex: 1;
  height: 28px;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: 2px;
  color: #fff;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 0 10px;
}

.sdr-frequency-manager-group-add-row .sdr-panel-input:focus {
  border: none;
}

.sdr-frequency-manager-group-add-row .sdr-panel-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.sdr-frequency-manager-group-add-row .sdr-panel-btn {
  --ba-ghost-height: 28px;
  --ba-ghost-padding: 0 12px;
  --ba-ghost-font-size: 9px;
  --ba-ghost-font-weight: 400;
  --ba-ghost-letter-spacing: 0.08em;
  --ba-ghost-bg: rgba(255, 255, 255, 0.08);
  --ba-ghost-color: #fff;
}

.sdr-frequency-manager-group-add-row .sdr-panel-btn:hover {
  --ba-ghost-hover-bg: rgba(255, 255, 255, 0.14);
  --ba-ghost-hover-color: #fff;
}

.sdr-group-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 20px 24px 10px;
}

.sdr-group-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: 2px;
  height: 28px;
  padding: 0 6px 0 14px;
  cursor: default;
  transition: background 0.15s;
}

.sdr-group-pill:hover {
  background: rgba(255, 255, 255, 0.13);
}

.sdr-group-pill-name {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
}

.sdr-group-pill-del:hover {
  color: rgba(255, 80, 80, 0.8);
}

.sdr-panel-add-row {
  display: flex;
  gap: 8px;
  padding: 10px 20px 18px 24px;
  flex-shrink: 0;
}

.sdr-panel-add-row .sdr-panel-input {
  flex: 1;
}
</style>
