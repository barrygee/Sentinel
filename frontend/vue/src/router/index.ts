import { createRouter, createWebHistory } from 'vue-router'
import AirView from '@/components/air/AirView.vue'
import SpaceView from '@/components/space/SpaceView.vue'
import SeaView from '@/components/sea/SeaView.vue'
import LandView from '@/components/land/LandView.vue'
import SdrView from '@/components/sdr/SdrView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',       redirect: '/air/' },
    { path: '/air/',   component: AirView   },
    { path: '/space/', component: SpaceView },
    { path: '/sea/',   component: SeaView   },
    { path: '/land/',  component: LandView  },
    { path: '/sdr/',   component: SdrView   },
    { path: '/docs/',  redirect: '/air/'    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
