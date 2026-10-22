import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this package as a Module Federation remote into
// frontend/spa-dist/remotes/sdr-manager-remote/. Its `./register` entry is
// src/register.ts: it adds settings and a capability, never a map section.
export default sentinelSectionViteConfig('sdr-manager-remote', import.meta.url, {
  registerEntry: './src/register.ts',
})
