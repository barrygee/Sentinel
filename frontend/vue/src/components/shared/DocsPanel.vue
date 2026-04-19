<template>
  <div id="docs-panel" :class="{ 'docs-panel-visible': open }">
    <div id="docs-sidebar">
      <nav id="docs-nav">
        <a v-for="section in sections" :key="section.href"
           :href="section.href" class="docs-nav-item"
           :class="{ active: activeSection === section.href }"
           @click.prevent="activeSection = section.href"
        >{{ section.label }}</a>
      </nav>
    </div>
    <div id="docs-content">
      <div id="docs-body" v-html="docsHtml" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const open = ref(false)
const docsHtml = ref('')
const activeSection = ref('#overview')

const sections = [
  { href: '#overview',        label: 'Overview'       },
  { href: '#getting-started', label: 'Getting Started' },
  { href: '#configuration',   label: 'Configuration'   },
  { href: '#architecture',    label: 'Architecture'    },
  { href: '#domains',         label: 'Domains'         },
  { href: '#settings-guide',  label: 'Settings'        },
  { href: '#api',             label: 'API Reference'   },
  { href: '#offline-maps',    label: 'Off Grid Maps'   },
  { href: '#deployment',      label: 'Deployment'      },
]

onMounted(async () => {
  try {
    const res = await fetch('/assets/docs-content.html')
    if (res.ok) docsHtml.value = await res.text()
  } catch {}

  try {
    const SS_KEY = 'sentinel_docs_open'
    if (sessionStorage.getItem(SS_KEY) === '1') open.value = true
  } catch {}
})

function toggle() {
  open.value = !open.value
  try {
    open.value ? sessionStorage.setItem('sentinel_docs_open', '1') : sessionStorage.removeItem('sentinel_docs_open')
  } catch {}
}

defineExpose({ toggle, open })
</script>
