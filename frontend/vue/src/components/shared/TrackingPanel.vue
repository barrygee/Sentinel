<template>
  <div id="msb-pane-tracking-inner">
    <div v-if="store.count === 0" id="msb-tracking-empty">No tracked items</div>
    <div
      v-for="item in store.allItems"
      :key="item.id"
      class="tracking-item"
      :class="{ 'tracking-item-readonly': !store.isLive(item.id) }"
      :data-tracking-id="item.id"
    >
      <div class="adsb-sb-name-row">
        <div class="tracking-item-header">
          <span class="adsb-sb-domain-label">{{ item.domain.toUpperCase() }}</span>
          <span class="adsb-sb-callsign">{{ item.name }}</span>
        </div>
        <button class="adsb-sb-untrack-btn" aria-label="Untrack" @click="store.untrackItem(item.id)">&#x2715;</button>
      </div>
      <div class="adsb-sb-fields">
        <div v-for="field in item.fields" :key="field.label" class="adsb-sb-field">
          <span class="adsb-sb-label">{{ field.label }}</span>
          <span class="adsb-sb-value" :class="{ 'adsb-sb-emrg': field.emrg }">{{ field.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTrackingStore } from '@/stores/tracking'
const store = useTrackingStore()
</script>

<style>
.tracking-item {
    width: 100%;
    color: #fff;
    font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    user-select: none;
    box-sizing: border-box;
}

.tracking-item-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.adsb-sb-domain-label {
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--color-accent, #c8ff00);
    text-transform: uppercase;
    line-height: 1;
}

#adsb-status-bar {
    position: fixed;
    bottom: calc(var(--footer-height, 44px) + 12px);
    left: 14px;
    width: 260px;
    background: rgba(10, 13, 20, 0.97);
    color: #fff;
    font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
    pointer-events: auto;
    display: none;
    flex-direction: column;
    gap: 0;
    user-select: none;
    box-sizing: border-box;
    z-index: 1100;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
}

#adsb-status-bar.adsb-sb-visible {
    display: flex;
}

.adsb-sb-name-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 28px 8px 28px;
}

.adsb-sb-untrack-btn {
    position: relative;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: rgba(255, 255, 255, 0.25);
    font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    transition: color 0.2s;
    flex-shrink: 0;
}

.adsb-sb-untrack-btn:hover {
    color: rgba(255, 255, 255, 0.7);
}

.adsb-sb-untrack-btn::after {
    content: 'UNTRACK';
    position: absolute;
    right: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: rgba(255, 255, 255, 0.7);
    font-family: 'Barlow Condensed', 'Barlow', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 4px 7px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
}

.adsb-sb-untrack-btn:hover::after {
    opacity: 1;
}

.adsb-sb-callsign {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: #fff;
    line-height: 1.2;
}

.adsb-sb-fields {
    padding: 6px 20px 13px 28px;
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
}

.adsb-sb-field {
    display: flex;
    gap: 14px;
    line-height: 1.7;
}

.adsb-sb-label {
    font-family: 'Barlow Condensed', 'Barlow', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    flex-shrink: 0;
    min-width: 52px;
}

.adsb-sb-value {
    font-family: 'Barlow Condensed', 'Barlow', sans-serif;
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.85);
    flex-shrink: 0;
}

.adsb-sb-emrg {
    color: #ff4040;
    font-weight: 600;
}

#tracking-toggle-btn {
    height: 36px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 10px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #fff;
    opacity: 0.6;
    transition: background 0.2s, opacity 0.2s, color 0.2s;
    flex-shrink: 0;
    margin: 4px 0;
}

#tracking-toggle-btn:hover {
    background: var(--color-border);
    border-radius: 6px;
    opacity: 1;
}

#tracking-toggle-btn.tracking-btn-active {
    opacity: 1;
    color: var(--color-accent);
}

#tracking-icon {
    display: block;
    flex-shrink: 0;
    width: auto;
    height: 15px;
}

#tracking-count {
    font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1;
    margin-bottom: 4px;
}

#tracking-count.tracking-count-active {
    color: var(--color-accent);
}
</style>
