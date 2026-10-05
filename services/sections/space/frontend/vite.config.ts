import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this section as a Module Federation remote into frontend/spa-dist/remotes/space/.
export default sentinelSectionViteConfig('space', import.meta.url)
