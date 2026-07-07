<template>
  <div id="sdr-group-list">
    <div class="sdr-group-pills">
      <div v-for="g in sortedGroups" :key="g.id" class="sdr-group-pill">
        <span class="sdr-group-pill-name">{{ g.name }}</span>
        <button
          class="sdr-group-pill-edit"
          title="Rename group"
          aria-label="Rename group"
          @click.stop="startEditGroupRow(g)"
        >
          &#x270E;
        </button>
        <button
          class="sdr-group-pill-del"
          title="Delete group"
          aria-label="Delete group"
          @click.stop="deleteGroup(g.id)"
        >
          &#x2715;
        </button>
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
    <button v-if="editingGroupId !== null" class="sdr-panel-btn" @click="cancelEditGroupRow">
      CANCEL
    </button>
    <button class="sdr-panel-btn" @click="submitGroupRow">
      {{ editingGroupId !== null ? 'SAVE' : 'ADD' }}
    </button>
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
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref, computed, nextTick } from 'vue'
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
