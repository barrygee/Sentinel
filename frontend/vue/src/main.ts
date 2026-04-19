import { createApp } from 'vue'
import { createPinia } from 'pinia'
import maplibregl from 'maplibre-gl'
import * as pmtiles from 'pmtiles'

import 'maplibre-gl/dist/maplibre-gl.css'

import App from './App.vue'
import router from './router'

// Register PMTiles protocol once at app startup — never inside a component.
const protocol = new pmtiles.Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
