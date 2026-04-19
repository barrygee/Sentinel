<template>
  <div id="msb-alerts-list">
    <div v-if="notificationsStore.visible.length === 0" id="msb-alerts-empty">No alerts</div>
    <div
      v-for="item in notificationsStore.visible"
      :key="item.id"
      class="msb-alert-item"
      :class="`msb-alert--${item.type}`"
    >
      <div class="msb-alert-title">{{ item.title }}</div>
      <div v-if="item.body" class="msb-alert-body">{{ item.body }}</div>
      <button class="msb-alert-dismiss" @click="notificationsStore.dismiss(item.id)">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNotificationsStore } from '@/stores/notifications'
const notificationsStore = useNotificationsStore()
</script>
