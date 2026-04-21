import { createApp } from 'vue'
import { createPinia } from 'pinia'
import maplibregl from 'maplibre-gl'
import * as pmtiles from 'pmtiles'

import 'maplibre-gl/dist/maplibre-gl.css'
import './assets/styles.css'

import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/app'
import type { ConnectivityMode } from './stores/app'

// Register PMTiles protocol once at app startup — never inside a component.
const protocol = new pmtiles.Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)

// Hydrate app store from localStorage before first render.
const appStore = useAppStore()
try {
  const savedMode = localStorage.getItem('sentinel_app_connectivityMode') as ConnectivityMode | null
  if (savedMode && (['auto', 'online', 'offgrid'] as string[]).includes(savedMode)) {
    appStore.setConnectivityMode(savedMode)
  }
} catch {}

app.mount('#app')
