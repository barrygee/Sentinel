import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this section as a Module Federation remote into frontend/spa-dist/remotes/globe/.
// It draws its own WebGL globe, not a MapLibre map, so it never makes the shell load MapLibre.
export default sentinelSectionViteConfig('globe', import.meta.url, { usesMap: false })
