import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this section as a Module Federation remote into frontend/spa-dist/remotes/sea/.
export default sentinelSectionViteConfig('sea', import.meta.url)
