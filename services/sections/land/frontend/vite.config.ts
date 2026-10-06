import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this section as a Module Federation remote into frontend/spa-dist/remotes/land/.
export default sentinelSectionViteConfig('land', import.meta.url)
