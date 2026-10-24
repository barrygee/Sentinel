import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this package as a Module Federation remote into
// frontend/spa-dist/remotes/sdr-manager-local/. Its `./register` entry is
// src/register.ts: it adds settings only, never a map section.
export default sentinelSectionViteConfig('sdr-manager-local', import.meta.url, {
  registerEntry: './src/register.ts',
})
